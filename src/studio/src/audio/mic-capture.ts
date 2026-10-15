/**
 * High-fidelity Browser Microphone Audio Capture & PCM Streamer.
 * Ingests live microphone input, downsamples/converts to 24kHz 16-bit linear PCM,
 * computes live RMS energy, and packages frames for WebSocket streaming.
 */

export interface MicCaptureOptions {
  sampleRate?: number;
  frameSizeSamples?: number;
  onChunk: (base64Chunk: string, rms: number) => void;
  onError?: (err: Error) => void;
}

export class MicCapture {
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private options: MicCaptureOptions;
  private isCapturing: boolean = false;

  constructor(options: MicCaptureOptions) {
    this.options = {
      sampleRate: 24000,
      frameSizeSamples: 480, // 20ms at 24kHz
      ...options,
    };
  }

  public async start(): Promise<void> {
    if (this.isCapturing) return;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.stream);

      // Buffer size: 1024 or 2048 samples
      const bufferSize = 1024;
      this.processorNode = this.audioCtx.createScriptProcessor(bufferSize, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isCapturing) return;

        const inputChannel = e.inputBuffer.getChannelData(0);
        const sourceRate = this.audioCtx?.sampleRate || 48000;
        const targetRate = this.options.sampleRate || 24000;

        // Downsample input buffer to target rate if needed
        const pcm16 = this.resampleAndConvertToInt16(inputChannel, sourceRate, targetRate);
        const rms = this.calculateFloatRms(inputChannel);

        // Convert Int16Array to base64
        const uint8 = new Uint8Array(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength);
        let binaryStr = '';
        const chunkLen = uint8.byteLength;
        for (let i = 0; i < chunkLen; i++) {
          binaryStr += String.fromCharCode(uint8[i]);
        }
        const base64Chunk = btoa(binaryStr);

        this.options.onChunk(base64Chunk, rms);
      };

      this.sourceNode.connect(this.processorNode);
      // Connect to a mute destination to keep the processor running in Chrome/Safari
      const silentGain = this.audioCtx.createGain();
      silentGain.gain.value = 0;
      this.processorNode.connect(silentGain);
      silentGain.connect(this.audioCtx.destination);

      this.isCapturing = true;
    } catch (err: unknown) {
      this.stop();
      const error = err instanceof Error ? err : new Error(String(err));
      if (this.options.onError) {
        this.options.onError(error);
      }
      throw error;
    }
  }

  public stop(): void {
    this.isCapturing = false;

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch {
        // ignore
      }
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }
  }

  public isActive(): boolean {
    return this.isCapturing;
  }

  private calculateFloatRms(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  private resampleAndConvertToInt16(
    input: Float32Array,
    srcRate: number,
    dstRate: number
  ): Int16Array {
    if (srcRate === dstRate) {
      const out = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      return out;
    }

    const ratio = srcRate / dstRate;
    const outLength = Math.round(input.length / ratio);
    const out = new Int16Array(outLength);

    for (let i = 0; i < outLength; i++) {
      const srcIndex = i * ratio;
      const low = Math.floor(srcIndex);
      const high = Math.min(low + 1, input.length - 1);
      const frac = srcIndex - low;

      const sample = input[low] + frac * (input[high] - input[low]);
      const s = Math.max(-1, Math.min(1, sample));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }

    return out;
  }
}
