import { describe, it, expect } from 'vitest';
import { JitterCalculator } from '../../src/core/metrics/jitter.js';

describe('jitter calculator', () => {
  it('should calculate RFC 3550 exponential jitter and percentiles', () => {
    const calc = new JitterCalculator(20);

    // Feed 10 packets with 20ms perfect interval -> 0 jitter
    let t = 1000;
    calc.recordPacket(t);
    for (let i = 0; i < 10; i++) {
      t += 20;
      calc.recordPacket(t);
    }
    expect(calc.getJitter()).toBe(0);

    // Feed packets with varied intervals (e.g. 10ms, 35ms, 15ms)
    t += 35; // delta = 15ms
    calc.recordPacket(t);
    t += 10; // delta = 10ms
    calc.recordPacket(t);
    t += 40; // delta = 20ms
    calc.recordPacket(t);

    expect(calc.getJitter()).toBeGreaterThan(0);

    const report = calc.generateReport();
    expect(report.sampleCount).toBe(13);
    expect(report.p50Ms).toBeGreaterThanOrEqual(0);
    expect(report.p99Ms).toBeGreaterThanOrEqual(report.p50Ms);
    expect(report.histogram.length).toBe(6);
  });
});
