/**
 * Automated Barge-In & Interruption Response Latency Harness.
 * Injects synthetic speech interruptions while the agent is streaming audio,
 * measures cancellation response delay, and detects rogue buffer bleed.
 */

export interface BargeInTestOptions {
  injectionOffsetMs: number;     // e.g. 500ms after agent starts speaking
  targetCutoffToleranceMs: number; // SLA threshold, default: 180ms
  bleedToleranceMs?: number;      // buffer bleed grace window, default: 40ms
}

export interface BargeInMetrics {
  injectionOffsetMs: number;         // Offset into agent speech when interruption triggered
  interruptionInitiatedAtMs: number; // Exact epoch timestamp when user interruption occurred
  agentAudioHaltedAtMs: number;      // Exact timestamp when agent stream stopped
  interruptionResponseDelayMs: number; // Halt time minus interruption initiation time
  discardedAudioFramesCount: number; // Frames received after interruption
  discardedAudioBytes: number;
  bleedDurationMs: number;           // Time frames continued arriving
  cleanCutoff: boolean;              // True if response delay <= targetCutoffToleranceMs
  slaTargetMs: number;
  passedSla: boolean;
}

export class BargeInTracker {
  private readonly options: Required<BargeInTestOptions>;
  private agentSpeechStartedAtMs: number | null = null;
  private interruptionTriggeredAtMs: number | null = null;
  private agentHaltedAtMs: number | null = null;
  private postInterruptionFrames = 0;
  private postInterruptionBytes = 0;
  private lastPostInterruptionFrameAtMs: number | null = null;

  constructor(options: Partial<BargeInTestOptions> = {}) {
    this.options = {
      injectionOffsetMs: options.injectionOffsetMs ?? 500,
      targetCutoffToleranceMs: options.targetCutoffToleranceMs ?? 180,
      bleedToleranceMs: options.bleedToleranceMs ?? 40,
    };
  }

  public recordAgentSpeechStart(timestampMs = Date.now()): void {
    this.agentSpeechStartedAtMs = timestampMs;
  }

  public triggerInterruption(timestampMs = Date.now()): void {
    this.interruptionTriggeredAtMs = timestampMs;
  }

  public recordAgentFrame(frameBytes: number, timestampMs = Date.now()): void {
    if (this.interruptionTriggeredAtMs !== null) {
      this.postInterruptionFrames++;
      this.postInterruptionBytes += frameBytes;
      this.lastPostInterruptionFrameAtMs = timestampMs;
    }
  }

  public markAgentHalted(timestampMs = Date.now()): void {
    this.agentHaltedAtMs = timestampMs;
  }

  public evaluate(): BargeInMetrics {
    const interruptAt = this.interruptionTriggeredAtMs ?? Date.now();
    const haltedAt = this.agentHaltedAtMs ?? this.lastPostInterruptionFrameAtMs ?? interruptAt;

    const delay = Math.max(0, haltedAt - interruptAt);
    const bleedDuration = this.lastPostInterruptionFrameAtMs
      ? Math.max(0, this.lastPostInterruptionFrameAtMs - interruptAt)
      : 0;

    const passedSla = delay <= this.options.targetCutoffToleranceMs;
    const cleanCutoff = passedSla && bleedDuration <= this.options.bleedToleranceMs;

    return {
      injectionOffsetMs: this.options.injectionOffsetMs,
      interruptionInitiatedAtMs: interruptAt,
      agentAudioHaltedAtMs: haltedAt,
      interruptionResponseDelayMs: delay,
      discardedAudioFramesCount: this.postInterruptionFrames,
      discardedAudioBytes: this.postInterruptionBytes,
      bleedDurationMs: bleedDuration,
      cleanCutoff,
      slaTargetMs: this.options.targetCutoffToleranceMs,
      passedSla,
    };
  }

  public getTargetOffsetMs(): number {
    return this.options.injectionOffsetMs;
  }
}
