import { VoiceTurnMetrics, LatencyBudget, DEFAULT_LATENCY_BUDGET } from '../metrics/waterfall.js';
import { BargeInMetrics } from '../metrics/barge-in.js';

export interface AggregateStats {
  count: number;
  mean: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

export interface BenchmarkSummary {
  totalTurns: number;
  passedTurns: number;
  warningTurns: number;
  failedTurns: number;
  turnaroundStats: AggregateStats;
  ttfaStats: AggregateStats;
  ttftStats: AggregateStats;
  vadSilenceStats: AggregateStats;
  jitterStats: AggregateStats;
  bargeInSummary?: {
    totalTests: number;
    passedTests: number;
    meanResponseDelayMs: number;
    maxResponseDelayMs: number;
    allPassed: boolean;
  };
  overallStatus: 'PASS' | 'WARN' | 'FAIL';
}

function computeStats(values: number[]): AggregateStats {
  if (values.length === 0) {
    return { count: 0, mean: 0, median: 0, p95: 0, min: 0, max: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / sorted.length;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1)] ?? 0;

  return {
    count: sorted.length,
    mean: Number(mean.toFixed(1)),
    median: Number(p50.toFixed(1)),
    p95: Number(p95.toFixed(1)),
    min: Number((sorted[0] ?? 0).toFixed(1)),
    max: Number((sorted[sorted.length - 1] ?? 0).toFixed(1)),
  };
}

export class BudgetEvaluator {
  private readonly budget: LatencyBudget;

  constructor(budget: LatencyBudget = DEFAULT_LATENCY_BUDGET) {
    this.budget = budget;
  }

  public evaluateSuite(
    turns: VoiceTurnMetrics[],
    bargeIns: BargeInMetrics[] = []
  ): BenchmarkSummary {
    const totalTurns = turns.length;
    let passedTurns = 0;
    let warningTurns = 0;
    let failedTurns = 0;

    const turnarounds: number[] = [];
    const ttfas: number[] = [];
    const ttfts: number[] = [];
    const vads: number[] = [];
    const jitters: number[] = [];

    for (const turn of turns) {
      turnarounds.push(turn.totalTurnaroundMs);
      ttfas.push(turn.timeToFirstAudioByteMs);
      ttfts.push(turn.timeToFirstTokenMs);
      vads.push(turn.vadSilenceDelayMs);
      jitters.push(turn.jitterMs);

      if (turn.budgetStatus === 'pass') passedTurns++;
      else if (turn.budgetStatus === 'warning') warningTurns++;
      else failedTurns++;
    }

    let bargeInSummary = undefined;
    let bargeInFailed = false;

    if (bargeIns.length > 0) {
      const delays = bargeIns.map((b) => b.interruptionResponseDelayMs);
      const passedCount = bargeIns.filter((b) => b.passedSla).length;
      const avgDelay = delays.reduce((a, b) => a + b, 0) / delays.length;
      const maxDelay = Math.max(...delays);
      bargeInFailed = passedCount < bargeIns.length;

      bargeInSummary = {
        totalTests: bargeIns.length,
        passedTests: passedCount,
        meanResponseDelayMs: Number(avgDelay.toFixed(1)),
        maxResponseDelayMs: Number(maxDelay.toFixed(1)),
        allPassed: !bargeInFailed,
      };
    }

    let overallStatus: 'PASS' | 'WARN' | 'FAIL' = 'PASS';
    if (failedTurns > 0 || bargeInFailed) {
      overallStatus = 'FAIL';
    } else if (warningTurns > 0) {
      overallStatus = 'WARN';
    }

    return {
      totalTurns,
      passedTurns,
      warningTurns,
      failedTurns,
      turnaroundStats: computeStats(turnarounds),
      ttfaStats: computeStats(ttfas),
      ttftStats: computeStats(ttfts),
      vadSilenceStats: computeStats(vads),
      jitterStats: computeStats(jitters),
      bargeInSummary,
      overallStatus,
    };
  }
}
