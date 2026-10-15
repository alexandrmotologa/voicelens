import pc from 'picocolors';
import { VoiceTurnMetrics } from '../metrics/waterfall.js';
import { BargeInMetrics } from '../metrics/barge-in.js';
import { BenchmarkSummary } from './budget-evaluator.js';

export function formatTerminalReport(
  summary: BenchmarkSummary,
  turns: VoiceTurnMetrics[],
  bargeIns: BargeInMetrics[] = []
): string {
  const lines: string[] = [];

  lines.push('');
  lines.push(pc.bold(pc.cyan('VoiceLens Latency Breakdown & Benchmark Report')));
  lines.push(pc.dim('═'.repeat(72)));

  // Turn-by-Turn Table
  lines.push(
    pc.bold(
      `${'Turn'.padEnd(10)} | ${'VAD(ms)'.padStart(8)} | ${'Uplink'.padStart(8)} | ${'TTFT'.padStart(8)} | ${'TTFA'.padStart(8)} | ${'Turnaround'.padStart(11)} | ${'Status'.padStart(8)}`
    )
  );
  lines.push(pc.dim('─'.repeat(72)));

  for (const t of turns) {
    let statusBadge = pc.green('PASS');
    if (t.budgetStatus === 'warning') statusBadge = pc.yellow('WARN');
    else if (t.budgetStatus === 'fail') statusBadge = pc.red('FAIL');

    lines.push(
      `${t.turnId.padEnd(10)} | ` +
      `${t.vadSilenceDelayMs.toFixed(0).padStart(8)} | ` +
      `${t.networkUplinkMs.toFixed(0).padStart(8)} | ` +
      `${t.timeToFirstTokenMs.toFixed(0).padStart(8)} | ` +
      `${t.timeToFirstAudioByteMs.toFixed(0).padStart(8)} | ` +
      `${pc.bold(t.totalTurnaroundMs.toFixed(0).padStart(11))} | ` +
      `${statusBadge.padStart(8)}`
    );
  }

  lines.push(pc.dim('─'.repeat(72)));

  // Statistical Aggregates
  lines.push('');
  lines.push(pc.bold('Acoustic Pipeline Latency Attribution:'));
  lines.push(
    `  • ${pc.dim('VAD Silence Delay (t_vad):')} Mean ${summary.vadSilenceStats.mean}ms (P95: ${summary.vadSilenceStats.p95}ms)`
  );
  lines.push(
    `  • ${pc.dim('Time to First Token (TTFT):')} Mean ${summary.ttftStats.mean}ms (P95: ${summary.ttftStats.p95}ms)`
  );
  lines.push(
    `  • ${pc.dim('Time to First Audio (TTFA):')} Mean ${summary.ttfaStats.mean}ms (P95: ${summary.ttfaStats.p95}ms)`
  );
  lines.push(
    `  • ${pc.dim('Total Perceived Turnaround:')} Mean ${summary.turnaroundStats.mean}ms (Min: ${summary.turnaroundStats.min}ms, Max: ${summary.turnaroundStats.max}ms, P95: ${summary.turnaroundStats.p95}ms)`
  );
  lines.push(
    `  • ${pc.dim('Packet Arrival Jitter:')}      Mean ${summary.jitterStats.mean}ms (P95: ${summary.jitterStats.p95}ms)`
  );

  // Barge-In Report
  if (bargeIns.length > 0 && summary.bargeInSummary) {
    lines.push('');
    lines.push(pc.bold('Barge-In Interruption Responsiveness:'));
    for (let i = 0; i < bargeIns.length; i++) {
      const b = bargeIns[i];
      const status = b.passedSla ? pc.green('PASS') : pc.red('FAIL');
      lines.push(
        `  Test #${i + 1}: offset +${b.injectionOffsetMs.toFixed(0)}ms -> halted in ${b.interruptionResponseDelayMs.toFixed(0)}ms (SLA: <${b.slaTargetMs}ms) [${status}], discarded: ${b.discardedAudioFramesCount} frames`
      );
    }
  }

  // Summary Verdict
  lines.push('');
  let verdictBadge = pc.bgGreen(pc.black(' OVERALL SLA STATUS: PASS '));
  if (summary.overallStatus === 'WARN') {
    verdictBadge = pc.bgYellow(pc.black(' OVERALL SLA STATUS: WARNING '));
  } else if (summary.overallStatus === 'FAIL') {
    verdictBadge = pc.bgRed(pc.white(' OVERALL SLA STATUS: FAILED '));
  }

  lines.push(`Result: ${verdictBadge} (${summary.passedTurns}/${summary.totalTurns} turns compliant)`);
  lines.push('');

  return lines.join('\n');
}

export function formatMarkdownReport(
  summary: BenchmarkSummary,
  turns: VoiceTurnMetrics[],
  bargeIns: BargeInMetrics[] = []
): string {
  const lines: string[] = [];

  lines.push('### VoiceLens Audio Latency & Barge-In Benchmark Report');
  lines.push('');
  lines.push(`**Overall Result:** \`${summary.overallStatus}\` (${summary.passedTurns}/${summary.totalTurns} turns compliant)`);
  lines.push('');

  lines.push('| Turn ID | VAD Silence | Uplink | TTFT (LLM) | TTFA (TTS) | Total Turnaround | Status |');
  lines.push('|:---|---:|---:|---:|---:|---:|:---:|');

  for (const t of turns) {
    const badge = t.budgetStatus === 'pass' ? '🟢 Pass' : t.budgetStatus === 'warning' ? '🟡 Warn' : '🔴 Fail';
    lines.push(
      `| ${t.turnId} | ${t.vadSilenceDelayMs.toFixed(0)} ms | ${t.networkUplinkMs.toFixed(0)} ms | ${t.timeToFirstTokenMs.toFixed(0)} ms | ${t.timeToFirstAudioByteMs.toFixed(0)} ms | **${t.totalTurnaroundMs.toFixed(0)} ms** | ${badge} |`
    );
  }

  lines.push('');
  lines.push('#### Latency Distribution Summary');
  lines.push('');
  lines.push('| Metric | Mean | Median (P50) | P95 | Min | Max |');
  lines.push('|:---|---:|---:|---:|---:|---:|');
  lines.push(`| **Turnaround Latency** | ${summary.turnaroundStats.mean} ms | ${summary.turnaroundStats.median} ms | ${summary.turnaroundStats.p95} ms | ${summary.turnaroundStats.min} ms | ${summary.turnaroundStats.max} ms |`);
  lines.push(`| **Time to First Audio (TTFA)** | ${summary.ttfaStats.mean} ms | ${summary.ttfaStats.median} ms | ${summary.ttfaStats.p95} ms | ${summary.ttfaStats.min} ms | ${summary.ttfaStats.max} ms |`);
  lines.push(`| **Time to First Token (TTFT)** | ${summary.ttftStats.mean} ms | ${summary.ttftStats.median} ms | ${summary.ttftStats.p95} ms | ${summary.ttftStats.min} ms | ${summary.ttftStats.max} ms |`);
  lines.push(`| **VAD Silence Confirmation** | ${summary.vadSilenceStats.mean} ms | ${summary.vadSilenceStats.median} ms | ${summary.vadSilenceStats.p95} ms | ${summary.vadSilenceStats.min} ms | ${summary.vadSilenceStats.max} ms |`);
  lines.push(`| **Frame Packet Jitter** | ${summary.jitterStats.mean} ms | ${summary.jitterStats.median} ms | ${summary.jitterStats.p95} ms | ${summary.jitterStats.min} ms | ${summary.jitterStats.max} ms |`);

  if (bargeIns.length > 0 && summary.bargeInSummary) {
    lines.push('');
    lines.push('#### Barge-In Interruption Benchmark');
    lines.push('');
    lines.push('| Test # | Injection Offset | Response Delay | Cutoff Target | Buffer Bleed | Result |');
    lines.push('|:---:|---:|---:|---:|---:|:---:|');
    for (let i = 0; i < bargeIns.length; i++) {
      const b = bargeIns[i];
      const resultBadge = b.passedSla ? '🟢 Passed' : '🔴 Failed';
      lines.push(
        `| #${i + 1} | +${b.injectionOffsetMs.toFixed(0)} ms | ${b.interruptionResponseDelayMs.toFixed(0)} ms | < ${b.slaTargetMs} ms | ${b.discardedAudioFramesCount} frames (${b.bleedDurationMs.toFixed(0)} ms) | ${resultBadge} |`
      );
    }
  }

  lines.push('');
  lines.push('*Generated by VoiceLens Profiler*');
  return lines.join('\n');
}
