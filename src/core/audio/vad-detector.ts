import { EventEmitter } from 'events';
import { calculateDbfs, calculateRms, calculateZcr } from './pcm-buffer.js';

export interface VadOptions {
  sampleRate: number;              // default: 24000
  frameDurationMs: number;          // frame size to process, default: 20ms
  thresholdDbfs: number;            // silence threshold, default: -42 dBFS
  minSpeechDurationMs: number;      // min active frames to declare speech, default: 60ms
  silenceHangoverMs: number;        // silence required to declare end of speech, default: 350ms
  adaptiveNoiseFloor?: boolean;     // dynamically adjust noise floor
}

export interface VadEventSpeechStart {
  timestampMs: number;
  frameIndex: number;
  dbfs: number;
}

export interface VadEventSpeechEnd {
  speechEndedAtMs: number;      // timestamp of the last voiced audio frame
  vadTriggeredAtMs: number;     // timestamp when silence hangover threshold was fulfilled
  silenceDelayMs: number;       // vadTriggeredAtMs - speechEndedAtMs (t_vad)
  totalSpeechDurationMs: number;
  frameIndex: number;
}

export interface VadFrameAnalysis {
  frameIndex: number;
  timestampMs: number;
  rms: number;
  dbfs: number;
  zcr: number;
  isVoice: boolean;
  state: 'silence' | 'speech';
}

export class VadDetector extends EventEmitter {
  private readonly options: Required<VadOptions>;
  private readonly frameBytes: number;

  private state: 'silence' | 'speech' = 'silence';
  private frameCount = 0;
  private consecutiveVoiceFrames = 0;
  private consecutiveSilenceFrames = 0;
  private speechStartTimestampMs = 0;
  private lastVoicedTimestampMs = 0;
  private bufferRemainder: Buffer = Buffer.alloc(0);
  private noiseFloorDbfs = -60;

  constructor(options: Partial<VadOptions> = {}) {
    super();
    this.options = {
      sampleRate: options.sampleRate ?? 24000,
      frameDurationMs: options.frameDurationMs ?? 20,
      thresholdDbfs: options.thresholdDbfs ?? -42,
      minSpeechDurationMs: options.minSpeechDurationMs ?? 60,
      silenceHangoverMs: options.silenceHangoverMs ?? 350,
      adaptiveNoiseFloor: options.adaptiveNoiseFloor ?? true,
    };

    // 16-bit mono = 2 bytes per sample
    const samplesPerFrame = Math.floor(
      (this.options.sampleRate * this.options.frameDurationMs) / 1000
    );
    this.frameBytes = samplesPerFrame * 2;
  }

  /**
   * Feed a chunk of raw 16-bit PCM audio.
   * Chunks are framed into exact frameDurationMs windows.
   */
  public processChunk(chunk: Buffer, currentClockMs?: number): VadFrameAnalysis[] {
    const combined = this.bufferRemainder.length > 0
      ? Buffer.concat([this.bufferRemainder, chunk])
      : chunk;

    const analyses: VadFrameAnalysis[] = [];
    let offset = 0;

    const baseClockMs = currentClockMs ?? Date.now();
    const frameMs = this.options.frameDurationMs;

    while (offset + this.frameBytes <= combined.length) {
      const frameBuffer = combined.subarray(offset, offset + this.frameBytes);
      const frameClockMs = baseClockMs + this.frameCount * frameMs;

      const analysis = this.analyzeFrame(frameBuffer, frameClockMs);
      analyses.push(analysis);

      offset += this.frameBytes;
      this.frameCount++;
    }

    this.bufferRemainder = combined.subarray(offset);
    return analyses;
  }

  private analyzeFrame(frame: Buffer, clockMs: number): VadFrameAnalysis {
    const rms = calculateRms(frame);
    const dbfs = calculateDbfs(frame);
    const zcr = calculateZcr(frame);

    // Dynamic noise floor tracking during confirmed silence
    if (this.options.adaptiveNoiseFloor && this.state === 'silence') {
      this.noiseFloorDbfs = 0.95 * this.noiseFloorDbfs + 0.05 * dbfs;
    }

    // Effective threshold: max of static threshold or noise floor + 12dB
    const effectiveThreshold = Math.max(
      this.options.thresholdDbfs,
      this.noiseFloorDbfs + 12
    );

    // Frame is considered voiced if energy exceeds threshold and has non-zero crossing
    const isVoice = dbfs >= effectiveThreshold && zcr < 0.65;

    const minSpeechFrames = Math.ceil(
      this.options.minSpeechDurationMs / this.options.frameDurationMs
    );
    const silenceHangoverFrames = Math.ceil(
      this.options.silenceHangoverMs / this.options.frameDurationMs
    );

    if (this.state === 'silence') {
      if (isVoice) {
        this.consecutiveVoiceFrames++;
        if (this.consecutiveVoiceFrames >= minSpeechFrames) {
          this.state = 'speech';
          this.speechStartTimestampMs = clockMs - (this.consecutiveVoiceFrames - 1) * this.options.frameDurationMs;
          this.lastVoicedTimestampMs = clockMs;
          this.consecutiveSilenceFrames = 0;

          const startEvent: VadEventSpeechStart = {
            timestampMs: this.speechStartTimestampMs,
            frameIndex: this.frameCount,
            dbfs,
          };
          this.emit('speech_start', startEvent);
        }
      } else {
        this.consecutiveVoiceFrames = 0;
      }
    } else {
      // Current state: 'speech'
      if (isVoice) {
        this.lastVoicedTimestampMs = clockMs;
        this.consecutiveSilenceFrames = 0;
      } else {
        this.consecutiveSilenceFrames++;
        if (this.consecutiveSilenceFrames >= silenceHangoverFrames) {
          this.state = 'silence';
          const vadTriggeredAtMs = clockMs;
          const speechEndedAtMs = this.lastVoicedTimestampMs;
          const silenceDelayMs = Math.max(0, vadTriggeredAtMs - speechEndedAtMs);
          const totalSpeechDurationMs = Math.max(0, speechEndedAtMs - this.speechStartTimestampMs);

          const endEvent: VadEventSpeechEnd = {
            speechEndedAtMs,
            vadTriggeredAtMs,
            silenceDelayMs,
            totalSpeechDurationMs,
            frameIndex: this.frameCount,
          };
          this.emit('speech_end', endEvent);

          this.consecutiveVoiceFrames = 0;
          this.consecutiveSilenceFrames = 0;
        }
      }
    }

    return {
      frameIndex: this.frameCount,
      timestampMs: clockMs,
      rms,
      dbfs,
      zcr,
      isVoice,
      state: this.state,
    };
  }

  public reset(): void {
    this.state = 'silence';
    this.frameCount = 0;
    this.consecutiveVoiceFrames = 0;
    this.consecutiveSilenceFrames = 0;
    this.speechStartTimestampMs = 0;
    this.lastVoicedTimestampMs = 0;
    this.bufferRemainder = Buffer.alloc(0);
    this.noiseFloorDbfs = -60;
  }

  public getState(): 'silence' | 'speech' {
    return this.state;
  }
}
