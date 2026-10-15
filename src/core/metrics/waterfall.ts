/**
 * Latency Waterfall Deconstruction & Turnaround Timing Engine.
 * Segments the voice loop into precise, observable acoustic milestones:
 * User Speech -> VAD Silence -> Uplink -> TTFT (ASR + LLM) -> TTFA (TTS) -> Playback
 */

import { JitterReport } from './jitter.js';

export type BudgetStatus = 'pass' | 'warning' | 'fail';

export interface LatencyBudget {
  passThresholdMs: number;    // e.g. < 600ms
  warnThresholdMs: number;    // e.g. 600 - 800ms
  failThresholdMs: number;    // e.g. > 800ms
}

export const DEFAULT_LATENCY_BUDGET: LatencyBudget = {
  passThresholdMs: 600,
  warnThresholdMs: 800,
  failThresholdMs: 800,
};

export interface TurnTimestamps {
  userSpeechStartedAtMs: number;
  userSpeechEndedAtMs: number;
  vadTriggeredAtMs: number;
  uplinkSentAtMs: number;
  serverAckAtMs: number;
  firstTokenReceivedAtMs?: number;
  firstAudioReceivedAtMs?: number;
  lastAudioReceivedAtMs?: number;
}

export interface VoiceTurnMetrics {
  turnId: string;
  userSpeechDurationMs: number;
  vadSilenceDelayMs: number;       // Time from user stopped speaking to VAD trigger (t_vad)
  networkUplinkMs: number;          // Client upload to server receipt
  serverProcessingMs: number;       // Server ASR + LLM computation
  timeToFirstTokenMs: number;       // First token event (TTFT)
  timeToFirstAudioByteMs: number;   // First audio chunk received by client (TTFA)
  totalTurnaroundMs: number;        // From user speech stopped until first audio heard
  audioPlaybackDurationMs: number;  // Agent total speech response duration
  jitterMs: number;                 // RFC 3550 audio frame arrival variance
  audioPacketCount: number;         // Actual audio chunks received
  audioBytesReceived: number;       // Total audio payload bytes received
  budgetStatus: BudgetStatus;
  timestamps: TurnTimestamps;
  jitterReport?: JitterReport;
}

export class TurnTracker {
  private readonly turnId: string;
  private readonly budget: LatencyBudget;
  private timestamps: Partial<TurnTimestamps> = {};
  private audioChunkArrivals: number[] = [];
  private totalAudioBytes = 0;

  constructor(turnId: string, budget: LatencyBudget = DEFAULT_LATENCY_BUDGET) {
    this.turnId = turnId;
    this.budget = budget;
  }

  public markUserSpeechStart(timestampMs = Date.now()): void {
    this.timestamps.userSpeechStartedAtMs = timestampMs;
  }

  public markUserSpeechEnd(timestampMs = Date.now()): void {
    this.timestamps.userSpeechEndedAtMs = timestampMs;
  }

  public markVadTrigger(timestampMs = Date.now()): void {
    this.timestamps.vadTriggeredAtMs = timestampMs;
  }

  public markUplinkSent(timestampMs = Date.now()): void {
    this.timestamps.uplinkSentAtMs = timestampMs;
  }

  public markServerAck(timestampMs = Date.now()): void {
    this.timestamps.serverAckAtMs = timestampMs;
  }

  public markFirstToken(timestampMs = Date.now()): void {
    if (!this.timestamps.firstTokenReceivedAtMs) {
      this.timestamps.firstTokenReceivedAtMs = timestampMs;
    }
  }

  public recordAudioChunk(chunkLength: number, timestampMs = Date.now()): void {
    if (!this.timestamps.firstAudioReceivedAtMs) {
      this.timestamps.firstAudioReceivedAtMs = timestampMs;
    }
    this.timestamps.lastAudioReceivedAtMs = timestampMs;
    this.audioChunkArrivals.push(timestampMs);
    this.totalAudioBytes += chunkLength;
  }

  public finalize(jitterMs = 0): VoiceTurnMetrics {
    const t = this.timestamps;
    const userSpeechEnd = t.userSpeechEndedAtMs ?? t.userSpeechStartedAtMs ?? Date.now();
    const userSpeechStart = t.userSpeechStartedAtMs ?? userSpeechEnd;
    const vadTrigger = t.vadTriggeredAtMs ?? userSpeechEnd;
    const uplink = t.uplinkSentAtMs ?? vadTrigger;
    const serverAck = t.serverAckAtMs ?? uplink;
    const firstToken = t.firstTokenReceivedAtMs ?? serverAck;
    const firstAudio = t.firstAudioReceivedAtMs ?? firstToken;
    const lastAudio = t.lastAudioReceivedAtMs ?? firstAudio;

    const userSpeechDurationMs = Math.max(0, userSpeechEnd - userSpeechStart);
    const vadSilenceDelayMs = Math.max(0, vadTrigger - userSpeechEnd);
    const networkUplinkMs = Math.max(0, serverAck - uplink);
    const serverProcessingMs = Math.max(0, firstToken - serverAck);
    const timeToFirstTokenMs = Math.max(0, firstToken - userSpeechEnd);
    const timeToFirstAudioByteMs = Math.max(0, firstAudio - userSpeechEnd);
    const totalTurnaroundMs = Math.max(0, firstAudio - userSpeechEnd);
    const audioPlaybackDurationMs = Math.max(0, lastAudio - firstAudio);

    let budgetStatus: BudgetStatus = 'pass';
    if (totalTurnaroundMs > this.budget.warnThresholdMs) {
      budgetStatus = 'fail';
    } else if (totalTurnaroundMs > this.budget.passThresholdMs) {
      budgetStatus = 'warning';
    }

    const completeTimestamps: TurnTimestamps = {
      userSpeechStartedAtMs: userSpeechStart,
      userSpeechEndedAtMs: userSpeechEnd,
      vadTriggeredAtMs: vadTrigger,
      uplinkSentAtMs: uplink,
      serverAckAtMs: serverAck,
      firstTokenReceivedAtMs: t.firstTokenReceivedAtMs,
      firstAudioReceivedAtMs: t.firstAudioReceivedAtMs,
      lastAudioReceivedAtMs: t.lastAudioReceivedAtMs,
    };

    return {
      turnId: this.turnId,
      userSpeechDurationMs,
      vadSilenceDelayMs,
      networkUplinkMs,
      serverProcessingMs,
      timeToFirstTokenMs,
      timeToFirstAudioByteMs,
      totalTurnaroundMs,
      audioPlaybackDurationMs,
      jitterMs,
      audioPacketCount: this.audioChunkArrivals.length,
      audioBytesReceived: this.totalAudioBytes,
      budgetStatus,
      timestamps: completeTimestamps,
    };
  }

  public getAudioChunkArrivals(): number[] {
    return [...this.audioChunkArrivals];
  }
}
