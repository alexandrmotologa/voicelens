import { describe, it, expect } from 'vitest';
import { TurnTracker } from '../../src/core/metrics/waterfall.js';

describe('waterfall timing', () => {
  it('should accurately segment conversation turn milestones', () => {
    const tracker = new TurnTracker('test_turn_1', {
      passThresholdMs: 600,
      warnThresholdMs: 800,
      failThresholdMs: 800,
    });

    const t0 = 1000;
    tracker.markUserSpeechStart(t0);
    tracker.markUserSpeechEnd(t0 + 1200); // 1200ms user speech
    tracker.markVadTrigger(t0 + 1500);    // 300ms VAD silence delay
    tracker.markUplinkSent(t0 + 1510);
    tracker.markServerAck(t0 + 1530);     // 20ms network uplink
    tracker.markFirstToken(t0 + 1650);    // 120ms server thinking
    tracker.recordAudioChunk(960, t0 + 1720); // First audio received at +520ms from speech end
    tracker.recordAudioChunk(960, t0 + 2500); // Audio response completes

    const metrics = tracker.finalize(12.5);

    expect(metrics.turnId).toBe('test_turn_1');
    expect(metrics.userSpeechDurationMs).toBe(1200);
    expect(metrics.vadSilenceDelayMs).toBe(300);
    expect(metrics.networkUplinkMs).toBe(20);
    expect(metrics.timeToFirstAudioByteMs).toBe(520);
    expect(metrics.totalTurnaroundMs).toBe(520);
    expect(metrics.budgetStatus).toBe('pass'); // 520ms < 600ms
    expect(metrics.jitterMs).toBe(12.5);
  });

  it('should flag SLA warnings and failures', () => {
    const trackerWarn = new TurnTracker('warn_turn');
    trackerWarn.markUserSpeechEnd(1000);
    trackerWarn.recordAudioChunk(960, 1750); // 750ms -> warning (600-800ms)
    expect(trackerWarn.finalize().budgetStatus).toBe('warning');

    const trackerFail = new TurnTracker('fail_turn');
    trackerFail.markUserSpeechEnd(1000);
    trackerFail.recordAudioChunk(960, 1950); // 950ms -> fail (>800ms)
    expect(trackerFail.finalize().budgetStatus).toBe('fail');
  });
});
