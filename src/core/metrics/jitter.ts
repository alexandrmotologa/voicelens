/**
 * RFC 3550 Interarrival Audio Packet Jitter Calculator.
 * Measures packet arrival variance and computes statistical percentiles (P50, P95, P99).
 */

export interface JitterReport {
  sampleCount: number;
  rfc3550JitterMs: number;
  meanDeltaMs: number;
  minDeltaMs: number;
  maxDeltaMs: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  histogram: { bucketLabel: string; count: number }[];
}

export class JitterCalculator {
  private nominalIntervalMs: number;
  private prevReceiveTimeMs: number | null = null;
  private prevTransitTimeMs: number | null = null;
  private smoothedJitterMs = 0;
  private deltasMs: number[] = [];

  constructor(nominalIntervalMs = 20) {
    this.nominalIntervalMs = nominalIntervalMs;
  }

  /**
   * Records a packet arrival.
   * If sendTimeMs is not provided, assumes ideal nominal interval spacing.
   */
  public recordPacket(receiveTimeMs = Date.now(), sendTimeMs?: number): number {
    if (this.prevReceiveTimeMs === null) {
      this.prevReceiveTimeMs = receiveTimeMs;
      if (sendTimeMs !== undefined) {
        this.prevTransitTimeMs = receiveTimeMs - sendTimeMs;
      }
      return 0;
    }

    let delta: number;

    if (sendTimeMs !== undefined && this.prevTransitTimeMs !== null) {
      const transitTime = receiveTimeMs - sendTimeMs;
      const d = Math.abs(transitTime - this.prevTransitTimeMs);
      delta = d;
      this.prevTransitTimeMs = transitTime;
    } else {
      // RFC 3550 estimation using nominal interval
      const interArrival = receiveTimeMs - this.prevReceiveTimeMs;
      delta = Math.abs(interArrival - this.nominalIntervalMs);
    }

    this.deltasMs.push(delta);
    // RFC 3550 exponential filter: J = J + (|D| - J) / 16
    this.smoothedJitterMs = this.smoothedJitterMs + (delta - this.smoothedJitterMs) / 16.0;

    this.prevReceiveTimeMs = receiveTimeMs;
    return this.smoothedJitterMs;
  }

  public getJitter(): number {
    return Number(this.smoothedJitterMs.toFixed(2));
  }

  public generateReport(): JitterReport {
    if (this.deltasMs.length === 0) {
      return {
        sampleCount: 0,
        rfc3550JitterMs: 0,
        meanDeltaMs: 0,
        minDeltaMs: 0,
        maxDeltaMs: 0,
        p50Ms: 0,
        p90Ms: 0,
        p95Ms: 0,
        p99Ms: 0,
        histogram: [],
      };
    }

    const sorted = [...this.deltasMs].sort((a, b) => a - b);
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const mean = sum / sorted.length;

    const getPercentile = (p: number): number => {
      const idx = Math.min(Math.floor((p / 100) * sorted.length), sorted.length - 1);
      return sorted[idx] ?? 0;
    };

    // Construct 6 histogram buckets
    const buckets = [
      { max: 5, label: '0-5ms', count: 0 },
      { max: 15, label: '5-15ms', count: 0 },
      { max: 30, label: '15-30ms', count: 0 },
      { max: 60, label: '30-60ms', count: 0 },
      { max: 100, label: '60-100ms', count: 0 },
      { max: Infinity, label: '>100ms', count: 0 },
    ];

    for (const d of sorted) {
      for (const b of buckets) {
        if (d <= b.max) {
          b.count++;
          break;
        }
      }
    }

    return {
      sampleCount: sorted.length,
      rfc3550JitterMs: Number(this.smoothedJitterMs.toFixed(2)),
      meanDeltaMs: Number(mean.toFixed(2)),
      minDeltaMs: Number((sorted[0] ?? 0).toFixed(2)),
      maxDeltaMs: Number((sorted[sorted.length - 1] ?? 0).toFixed(2)),
      p50Ms: Number(getPercentile(50).toFixed(2)),
      p90Ms: Number(getPercentile(90).toFixed(2)),
      p95Ms: Number(getPercentile(95).toFixed(2)),
      p99Ms: Number(getPercentile(99).toFixed(2)),
      histogram: buckets.map((b) => ({ bucketLabel: b.label, count: b.count })),
    };
  }

  public reset(): void {
    this.prevReceiveTimeMs = null;
    this.prevTransitTimeMs = null;
    this.smoothedJitterMs = 0;
    this.deltasMs = [];
  }
}
