import { Command } from 'commander';
import pc from 'picocolors';
import { OpenAiRealtimeProtocol } from '../../protocols/openai-realtime.js';
import { MockVoiceAgentServer } from '../../protocols/mock-voice-agent.js';
import { BenchmarkSuite } from '../../core/runner/benchmark-suite.js';
import { formatTerminalReport, formatMarkdownReport } from '../../core/runner/reporters.js';

export const bargeInCommand = new Command('barge-in')
  .description('Perform automated speech interruption (barge-in) stress testing against a voice agent')
  .option('-t, --target <url>', 'Target WebSocket endpoint (default: internal mock agent)', 'mock')
  .option('-p, --profile <name>', 'Mock acoustic profile (ultra_fast, enterprise_standard, congested_telephony)', 'enterprise_standard')
  .option('--offsets <list>', 'Comma-separated interruption offsets in ms (default: 250,500,800)', '250,500,800')
  .option('--sla <ms>', 'Maximum acceptable cancellation latency in ms (default: 180ms)', '180')
  .option('--format <format>', 'Output format: console, markdown, json', 'console')
  .option('--fail-on-budget', 'Exit code 1 if any interruption exceeds SLA', false)
  .action(async (opts) => {
    let mockServer: MockVoiceAgentServer | null = null;
    let endpointUrl = opts.target;

    try {
      if (endpointUrl === 'mock') {
        console.log(pc.cyan('Starting embedded mock voice agent for barge-in testing...'));
        mockServer = new MockVoiceAgentServer({
          port: 50099,
          profileName: opts.profile,
        });
        const actualPort = await mockServer.start();
        endpointUrl = `ws://localhost:${actualPort}`;
      }

      const offsets = (opts.offsets as string)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => !isNaN(n) && n > 0);

      const slaTolerance = Number(opts.sla) || 180;

      const scenarios = offsets.map((offset, idx) => ({
        id: `barge_in_${offset}ms`,
        transcript: `Interruption test #${idx + 1} at +${offset}ms into response`,
        testBargeIn: true,
        bargeInOffsetMs: offset,
      }));

      const protocol = new OpenAiRealtimeProtocol({ endpointUrl });
      const suite = new BenchmarkSuite({
        protocol,
        scenarios,
        bargeInToleranceMs: slaTolerance,
      });

      console.log(pc.dim(`Running ${scenarios.length} interruption sweeps against ${endpointUrl}...`));

      const { summary, turns, bargeIns } = await suite.run();
      await protocol.disconnect();

      if (opts.format === 'markdown') {
        console.log(formatMarkdownReport(summary, turns, bargeIns));
      } else if (opts.format === 'json') {
        console.log(JSON.stringify({ summary, turns, bargeIns }, null, 2));
      } else {
        console.log(formatTerminalReport(summary, turns, bargeIns));
      }

      if (opts.failOnBudget && summary.overallStatus === 'FAIL') {
        console.error(pc.red('Barge-in cancellation SLA failed!'));
        process.exitCode = 1;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`Error during barge-in testing: ${msg}`));
      process.exitCode = 1;
    } finally {
      if (mockServer) {
        await mockServer.stop();
      }
    }
  });
