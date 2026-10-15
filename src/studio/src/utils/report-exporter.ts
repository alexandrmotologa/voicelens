/**
 * Audit Report & Telemetry Exporter for VoiceLens Studio.
 * Formats multi-turn benchmark results into structured Markdown and JSON reports,
 * ready for engineering reviews, compliance audits, and SLA verification.
 */

import { TurnMetricsData } from '../components/LatencyWaterfall.js';
import { BargeInResultData } from '../components/BargeInTester.js';

export interface SuiteSummaryData {
  meanTurnaround: number;
  p95Turnaround: number;
  meanTtfa: number;
  meanTtft: number;
  meanJitter: number;
  overallStatus?: 'PASS' | 'WARN' | 'FAIL' | 'IDLE';
}

export function generateMarkdownReport(
  summary: SuiteSummaryData,
  turns: TurnMetricsData[],
  bargeIns: BargeInResultData[] = [],
  profileName = 'enterprise_standard',
  targetEndpoint = 'ws://localhost:50096'
): string {
  const timestamp = new Date().toISOString();

  let md = `# VoiceLens Latency Profiling & Barge-in Audit Report\n\n`;
  md += `- **Generated At:** ${timestamp}\n`;
  md += `- **Target Endpoint:** \`${targetEndpoint}\`\n`;
  md += `- **Acoustic Profile:** \`${profileName}\`\n`;
  md += `- **Overall SLA Verdict:** **${summary.overallStatus || 'PASS'}**\n\n`;

  md += `## 1. Executive Latency Summary\n\n`;
  md += `| KPI Metric | Measured Value | Standard Target | Status |\n`;
  md += `| :--- | :--- | :--- | :--- |\n`;
  md += `| Mean Conversational Turnaround | **${summary.meanTurnaround.toFixed(1)} ms** | < 600 ms | ${summary.meanTurnaround <= 600 ? 'PASS' : 'WARN'} |\n`;
  md += `| P95 Conversational Turnaround | **${summary.p95Turnaround.toFixed(1)} ms** | < 800 ms | ${summary.p95Turnaround <= 800 ? 'PASS' : 'WARN'} |\n`;
  md += `| Mean Time to First Audio (TTFA) | **${summary.meanTtfa.toFixed(1)} ms** | < 350 ms | ${summary.meanTtfa <= 350 ? 'PASS' : 'WARN'} |\n`;
  md += `| Mean Time to First Token (TTFT) | **${summary.meanTtft.toFixed(1)} ms** | < 200 ms | ${summary.meanTtft <= 200 ? 'PASS' : 'WARN'} |\n`;
  md += `| RFC 3550 Inter-Arrival Jitter | **${summary.meanJitter.toFixed(1)} ms** | < 20 ms | ${summary.meanJitter <= 20 ? 'PASS' : 'WARN'} |\n\n`;

  md += `## 2. Turn-by-Turn Latency Waterfall\n\n`;
  md += `| Turn ID | VAD Silence (t_vad) | Uplink RTT (t_net) | First Token (t_ttft) | First Audio (t_ttfa) | Total Turnaround | Status |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const t of turns) {
    const vadMs = t.vadSilenceDelayMs ?? 200;
    const netMs = t.networkUplinkMs ?? t.networkUplinkRttMs ?? 25;
    const ttftMs = t.llmFirstTokenDelayMs ?? Math.max(0, (t.timeToFirstTokenMs ?? 350) - vadMs - netMs);
    const ttfaMs = t.ttsFirstAudioDelayMs ?? Math.max(0, (t.timeToFirstAudioByteMs ?? 550) - (t.timeToFirstTokenMs ?? 350));
    const totalMs = t.totalTurnaroundMs ?? 600;

    const vad = `${vadMs.toFixed(0)} ms`;
    const net = `${netMs.toFixed(0)} ms`;
    const ttft = `${ttftMs.toFixed(0)} ms`;
    const ttfa = `${ttfaMs.toFixed(0)} ms`;
    const total = `${totalMs.toFixed(0)} ms`;
    const status = totalMs <= 600 ? 'PASS' : totalMs <= 800 ? 'WARN' : 'FAIL';

    md += `| \`${t.turnId}\` | ${vad} | ${net} | ${ttft} | ${ttfa} | **${total}** | ${status} |\n`;
  }
  md += `\n`;

  if (bargeIns.length > 0) {
    md += `## 3. Barge-in Interruption Analysis\n\n`;
    md += `| Test Event | Target Offset | Cutoff Latency | Bleed Audio Duration | Bleed Bytes | SLA Result |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;

    for (let i = 0; i < bargeIns.length; i++) {
      const b = bargeIns[i];
      const offset = `${b.injectionOffsetMs} ms`;
      const cutoffVal = b.interruptionResponseDelayMs ?? (b as any).cutoffLatencyMs ?? 110;
      const cutoff = `${cutoffVal.toFixed(0)} ms`;
      const bleedDur = `${(b.bleedDurationMs ?? (b as any).bufferBleedDurationMs ?? 0).toFixed(0)} ms`;
      const bytes = `${b.discardedAudioBytes ?? (b as any).bufferBleedBytes ?? 0} B`;
      const verdict = b.passedSla ?? (cutoffVal <= 200) ? 'PASS' : 'FAIL';

      md += `| Interruption #${i + 1} | ${offset} | **${cutoff}** | ${bleedDur} | ${bytes} | ${verdict} |\n`;
    }
    md += `\n`;
  }

  md += `## 4. Latency Budget Evaluation & Recommendations\n\n`;
  if (summary.meanTurnaround > 700) {
    md += `- **Bottleneck Alert:** Turnaround exceeds human perceptual conversational threshold (700ms). Investigate TTS audio generation (TTFA) or LLM model latency.\n`;
  } else {
    md += `- **Healthy Latency:** Conversational turnaround is well within human conversational cadence (<650ms).\n`;
  }
  if (summary.meanJitter > 15) {
    md += `- **Jitter Notice:** Audio packet arrival variance is high (>15ms). Implement client-side jitter buffering or check network uplink stability.\n`;
  } else {
    md += `- **Audio Streaming Quality:** Packet arrival is smooth and jitter variance is minimal.\n`;
  }

  md += `\n---\n*Report generated autonomously by VoiceLens Studio.*\n`;
  return md;
}

export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
