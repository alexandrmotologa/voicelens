import { Command } from 'commander';
import fs from 'fs';
import pc from 'picocolors';
import { OpenAiRealtimeProtocol } from '../../protocols/openai-realtime.js';
import { MockVoiceAgentServer } from '../../protocols/mock-voice-agent.js';
import { BenchmarkSuite, TurnScenario } from '../../core/runner/benchmark-suite.js';
import { formatTerminalReport, formatMarkdownReport } from '../../core/runner/reporters.js';

export const benchmarkCommand = new Command('benchmark')
  .description('Run multi-turn conversational latency benchmark against a voice agent stream')
  .option('-t, --target <url>', 'Target WebSocket endpoint (default: internal mock agent)', 'mock')
  .option('-k, --api-key <key>', 'API key for authenticated voice endpoints')
  .option('-p, --profile <name>', 'Mock acoustic profile (ultra_fast, enterprise_standard, congested_telephony)', 'enterprise_standard')
  .option('-s, --scenario <file>', 'Path to JSON conversation scenarios file')
  .option('--max-ttfa <ms>', 'SLA budget for Time-To-First-Audio (default: 600ms)', '600')
  .option('--max-turnaround <ms>', 'SLA budget for Total Turnaround (default: 800ms)', '800')
  .option('--format <format>', 'Output format: console, markdown, json', 'console')
  .option('-o, --output <file>', 'Save benchmark report to file')
  .option('--fail-on-budget', 'Exit with code 1 if SLA latency budget is violated', false)
  .action(async (opts) => {
    let mockServer: MockVoiceAgentServer | null = null;
    let endpointUrl = opts.target;

    try {
      if (endpointUrl === 'mock') {
        console.log(pc.cyan('Starting embedded acoustic voice mock server...'));
        mockServer = new MockVoiceAgentServer({
          port: 50098,
          profileName: opts.profile,
        });
        const actualPort = await mockServer.start();
        endpointUrl = `ws://localhost:${actualPort}`;
      }

      console.log(pc.dim(`Connecting to voice agent at: ${endpointUrl}`));

      let scenarios: TurnScenario[] | undefined = undefined;
      if (opts.scenario && fs.existsSync(opts.scenario)) {
        const raw = fs.readFileSync(opts.scenario, 'utf-8');
        scenarios = JSON.parse(raw);
      }

      const budget = {
        passThresholdMs: Number(opts.maxTtfa) || 600,
        warnThresholdMs: Number(opts.maxTurnaround) || 800,
        failThresholdMs: Number(opts.maxTurnaround) || 800,
      };

      const protocol = new OpenAiRealtimeProtocol({
        endpointUrl,
        apiKey: opts.apiKey,
      });

      const suite = new BenchmarkSuite({
        protocol,
        scenarios,
        budget,
      });

      suite.on('turn_start', (evt) => {
        if (opts.format === 'console') {
          console.log(pc.dim(`Turn [${evt.index + 1}/${evt.total}] "${evt.turnId}": streaming audio...`));
        }
      });

      const { summary, turns, bargeIns } = await suite.run();
      await protocol.disconnect();

      let outputText = '';
      if (opts.format === 'markdown') {
        outputText = formatMarkdownReport(summary, turns, bargeIns);
      } else if (opts.format === 'json') {
        outputText = JSON.stringify({ summary, turns, bargeIns }, null, 2);
      } else {
        outputText = formatTerminalReport(summary, turns, bargeIns);
      }

      console.log(outputText);

      if (opts.output) {
        fs.writeFileSync(opts.output, outputText, 'utf-8');
        console.log(pc.green(`Report saved to ${opts.output}`));
      }

      if (opts.failOnBudget && summary.overallStatus === 'FAIL') {
        console.error(pc.red('Benchmark failed SLA latency budget threshold!'));
        process.exitCode = 1;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`Error during benchmark: ${msg}`));
      process.exitCode = 1;
    } finally {
      if (mockServer) {
        await mockServer.stop();
      }
    }
  });
