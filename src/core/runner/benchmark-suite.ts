import { EventEmitter } from 'events';
import { BaseVoiceProtocol } from '../../protocols/base.js';
import { VadDetector } from '../audio/vad-detector.js';
import { generateSyntheticUtterance, GoldenUtterance, getGoldenUtterances } from '../audio/synthetic-voice.js';
import { TurnTracker, VoiceTurnMetrics, LatencyBudget, DEFAULT_LATENCY_BUDGET } from '../metrics/waterfall.js';
import { JitterCalculator } from '../metrics/jitter.js';
import { BargeInTracker, BargeInMetrics } from '../metrics/barge-in.js';
import { BudgetEvaluator, BenchmarkSummary } from './budget-evaluator.js';

export interface TurnScenario {
  id: string;
  transcript: string;
  audioPcm?: Buffer;
  durationMs?: number;
  silenceAfterMs?: number;
  testBargeIn?: boolean;
  bargeInOffsetMs?: number;
}

export interface SuiteConfig {
  protocol: BaseVoiceProtocol;
  scenarios?: TurnScenario[];
  budget?: LatencyBudget;
  sampleRate?: number;
  bargeInToleranceMs?: number;
}

export class BenchmarkSuite extends EventEmitter {
  private protocol: BaseVoiceProtocol;
  private scenarios: TurnScenario[];
  private budget: LatencyBudget;
  private sampleRate: number;
  private bargeInToleranceMs: number;

  constructor(config: SuiteConfig) {
    super();
    this.protocol = config.protocol;
    this.budget = config.budget ?? DEFAULT_LATENCY_BUDGET;
    this.sampleRate = config.sampleRate ?? 24000;
    this.bargeInToleranceMs = config.bargeInToleranceMs ?? 180;

    // Use default golden scenarios if none provided
    if (config.scenarios && config.scenarios.length > 0) {
      this.scenarios = config.scenarios;
    } else {
      const golden = getGoldenUtterances(this.sampleRate);
      this.scenarios = [
        {
          id: 'turn_1',
          transcript: golden[0].transcript,
          audioPcm: golden[0].audioPcm,
          testBargeIn: false,
        },
        {
          id: 'turn_2',
          transcript: golden[1].transcript,
          audioPcm: golden[1].audioPcm,
          testBargeIn: true,
          bargeInOffsetMs: 400,
        },
      ];
    }
  }

  public async run(): Promise<{
    summary: BenchmarkSummary;
    turns: VoiceTurnMetrics[];
    bargeIns: BargeInMetrics[];
  }> {
    if (!this.protocol.isConnected()) {
      await this.protocol.connect();
    }

    const turns: VoiceTurnMetrics[] = [];
    const bargeIns: BargeInMetrics[] = [];

    for (let i = 0; i < this.scenarios.length; i++) {
      const scenario = this.scenarios[i];
      this.emit('turn_start', { turnId: scenario.id, index: i, total: this.scenarios.length });

      const result = await this.executeTurn(scenario);
      turns.push(result.turnMetrics);
      if (result.bargeInMetrics) {
        bargeIns.push(result.bargeInMetrics);
      }

      this.emit('turn_end', {
        turnId: scenario.id,
        metrics: result.turnMetrics,
        bargeIn: result.bargeInMetrics,
      });

      // Small conversational pause between turns (400ms)
      await new Promise((r) => setTimeout(r, 400));
    }

    const evaluator = new BudgetEvaluator(this.budget);
    const summary = evaluator.evaluateSuite(turns, bargeIns);

    this.emit('suite_completed', { summary, turns, bargeIns });
    return { summary, turns, bargeIns };
  }

  private async executeTurn(scenario: TurnScenario): Promise<{
    turnMetrics: VoiceTurnMetrics;
    bargeInMetrics?: BargeInMetrics;
  }> {
    const tracker = new TurnTracker(scenario.id, this.budget);
    const jitterCalc = new JitterCalculator(20);
    const vad = new VadDetector({ sampleRate: this.sampleRate, silenceHangoverMs: 300 });

    const bargeInTracker = scenario.testBargeIn
      ? new BargeInTracker({
          injectionOffsetMs: scenario.bargeInOffsetMs ?? 400,
          targetCutoffToleranceMs: this.bargeInToleranceMs,
        })
      : null;

    let bargeInTriggered = false;
    let turnCompleted = false;

    // Generate or use existing PCM audio
    const audioPcm = scenario.audioPcm ?? generateSyntheticUtterance({
      sampleRate: this.sampleRate,
      durationMs: scenario.durationMs ?? 1500,
      silenceAfterMs: scenario.silenceAfterMs ?? 400,
    });

    return new Promise<{ turnMetrics: VoiceTurnMetrics; bargeInMetrics?: BargeInMetrics }>((resolve, reject) => {
      let turnTimeout: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (turnTimeout) clearTimeout(turnTimeout);
        this.protocol.off('first_token', onToken);
        this.protocol.off('audio_frame', onAudio);
        this.protocol.off('response_completed', onComplete);
        this.protocol.off('response_cancelled', onCancelled);
        this.protocol.off('error', onError);
      };

      const finishTurn = () => {
        if (turnCompleted) return;
        turnCompleted = true;
        cleanup();

        const turnMetrics = tracker.finalize(jitterCalc.getJitter());
        const bargeInMetrics = bargeInTracker ? bargeInTracker.evaluate() : undefined;
        resolve({ turnMetrics, bargeInMetrics });
      };

      const onToken = (token: string, timestampMs: number) => {
        tracker.markFirstToken(timestampMs);
        this.emit('token', { turnId: scenario.id, token, timestampMs });
      };

      const onAudio = (chunk: Buffer, timestampMs: number) => {
        tracker.recordAudioChunk(chunk.length, timestampMs);
        jitterCalc.recordPacket(timestampMs);

        if (bargeInTracker) {
          bargeInTracker.recordAgentFrame(chunk.length, timestampMs);

          // If offset reached and not yet interrupted, fire interruption
          if (!bargeInTriggered) {
            const firstAudioTime = tracker.finalize().timestamps.firstAudioReceivedAtMs ?? timestampMs;
            const elapsedSinceAudio = timestampMs - firstAudioTime;
            if (elapsedSinceAudio >= bargeInTracker.getTargetOffsetMs()) {
              bargeInTriggered = true;
              bargeInTracker.triggerInterruption(Date.now());
              this.emit('barge_in_triggered', { turnId: scenario.id, timestampMs: Date.now() });

              // Request protocol cancellation
              this.protocol.cancelResponse().catch(() => {});
            }
          }
        }

        this.emit('audio_frame', { turnId: scenario.id, chunk, timestampMs });
      };

      const onComplete = () => {
        finishTurn();
      };

      const onCancelled = () => {
        if (bargeInTracker) {
          bargeInTracker.markAgentHalted(Date.now());
        }
        finishTurn();
      };

      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };

      this.protocol.on('first_token', onToken);
      this.protocol.on('audio_frame', onAudio);
      this.protocol.on('response_completed', onComplete);
      this.protocol.on('response_cancelled', onCancelled);
      this.protocol.on('error', onError);

      // Failsafe timeout after 15 seconds
      turnTimeout = setTimeout(() => {
        finishTurn();
      }, 15000);

      // Now stream the caller's audio frame by frame (20ms frames)
      const frameDurationMs = 20;
      const samplesPerFrame = Math.floor((this.sampleRate * frameDurationMs) / 1000);
      const frameBytes = samplesPerFrame * 2;
      let offset = 0;

      tracker.markUserSpeechStart(Date.now());
      let lastSpeechTimestamp = Date.now();

      const sendNextCallerFrame = async () => {
        if (offset >= audioPcm.length) {
          // Finished sending caller audio
          tracker.markUserSpeechEnd(lastSpeechTimestamp);
          tracker.markVadTrigger(Date.now());
          tracker.markUplinkSent(Date.now());

          await this.protocol.commitAudio();
          tracker.markServerAck(Date.now());

          await this.protocol.triggerResponse();
          return;
        }

        const chunk = audioPcm.subarray(offset, Math.min(offset + frameBytes, audioPcm.length));
        offset += frameBytes;

        const analyses = vad.processChunk(chunk);
        for (const a of analyses) {
          if (a.isVoice) {
            lastSpeechTimestamp = Date.now();
          }
        }

        await this.protocol.sendAudioChunk(chunk);
        this.emit('caller_frame', { turnId: scenario.id, chunk, timestampMs: Date.now() });

        setTimeout(sendNextCallerFrame, frameDurationMs);
      };

      sendNextCallerFrame();
    });
  }
}
