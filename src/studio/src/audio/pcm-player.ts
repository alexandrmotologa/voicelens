/**
 * High-performance Web Audio API PCM Stream Player.
 * Decodes streaming 24kHz 16-bit linear PCM chunks in real-time,
 * schedules gapless playback, and provides instant audio cutoff on barge-in.
 */

export class PcmPlayer {
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private sampleRate: number;
  private nextPlayTime: number = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private isMuted: boolean = false;
  private volume: number = 0.8;

  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
  }

  private ensureContext(): AudioContext {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });
      this.gainNode = this.audioCtx.createGain();
      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
      this.gainNode.connect(this.audioCtx.destination);
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Feed a base64-encoded 16-bit PCM chunk into the gapless playback queue.
   */
  public playChunk(base64Chunk: string): void {
    if (this.isMuted) return;

    try {
      const binaryString = atob(base64Chunk);
      const len = binaryString.length;
      const sampleCount = Math.floor(len / 2);
      if (sampleCount === 0) return;

      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const int16Array = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
      const float32Array = new Float32Array(sampleCount);

      for (let i = 0; i < sampleCount; i++) {
        const val = int16Array[i];
        float32Array[i] = val < 0 ? val / 32768 : val / 32767;
      }

      const ctx = this.ensureContext();
      const buffer = ctx.createBuffer(1, sampleCount, this.sampleRate);
      buffer.getChannelData(0).set(float32Array);

      const source = ctx.createBufferSource();
      source.buffer = buffer;

      if (this.gainNode) {
        source.connect(this.gainNode);
      } else {
        source.connect(ctx.destination);
      }

      const now = ctx.currentTime;
      // Pre-roll buffer margin of 25ms to prevent audio glitches
      const scheduledTime = Math.max(now + 0.02, this.nextPlayTime);
      source.start(scheduledTime);
      this.nextPlayTime = scheduledTime + buffer.duration;

      this.activeSources.add(source);
      source.onended = () => {
        this.activeSources.delete(source);
      };
    } catch (err) {
      console.warn('Failed to decode/play PCM chunk:', err);
    }
  }

  /**
   * Instantly halt audio playback and purge all buffered chunks.
   * Invoked upon barge-in interruption or turn completion.
   */
  public stop(): void {
    for (const source of this.activeSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source might have finished
      }
    }
    this.activeSources.clear();

    if (this.audioCtx) {
      this.nextPlayTime = this.audioCtx.currentTime;
    } else {
      this.nextPlayTime = 0;
    }
  }

  public setMute(muted: boolean): void {
    this.isMuted = muted;
    if (this.gainNode && this.audioCtx) {
      this.gainNode.gain.setValueAtTime(muted ? 0 : this.volume, this.audioCtx.currentTime);
    }
    if (muted) {
      this.stop();
    }
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.audioCtx && !this.isMuted) {
      this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
    }
  }

  public close(): void {
    this.stop();
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
      this.gainNode = null;
    }
  }
}
