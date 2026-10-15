import { Command } from 'commander';
import pc from 'picocolors';
import { MockVoiceAgentServer, ACOUSTIC_PROFILES } from '../../protocols/mock-voice-agent.js';

export const mockServerCommand = new Command('mock-server')
  .description('Start a local OpenAI Realtime compliant voice agent reference server with simulated acoustic latency profiles')
  .option('-p, --port <number>', 'Port to listen on', '50096')
  .option('--profile <name>', 'Acoustic latency profile (ultra_fast, enterprise_standard, congested_telephony)', 'enterprise_standard')
  .action(async (opts) => {
    const port = Number(opts.port) || 50096;
    const profile = opts.profile in ACOUSTIC_PROFILES ? opts.profile : 'enterprise_standard';

    const server = new MockVoiceAgentServer({
      port,
      profileName: profile,
    });

    const actualPort = await server.start();
    const prof = server.getProfile();

    console.log('');
    console.log(pc.bold(pc.cyan('VoiceLens Mock Voice Agent Server Active')));
    console.log(pc.dim('═'.repeat(60)));
    console.log(`  • ${pc.bold('WebSocket URL:')} ws://localhost:${actualPort}`);
    console.log(`  • ${pc.bold('Health check:')}  http://localhost:${actualPort}/health`);
    console.log(`  • ${pc.bold('Active Profile:')} ${prof.name}`);
    console.log(`    - ASR Delay: ${prof.asrDurationMs}ms`);
    console.log(`    - LLM TTFT:  ${prof.llmTtftMs}ms`);
    console.log(`    - TTS TTFA:  ${prof.ttsTtfaMs}ms`);
    console.log(`    - Cutoff:    ${prof.bargeInHaltDelayMs}ms`);
    console.log('');
    console.log(pc.dim('Ready to accept OpenAI Realtime WebSocket connections. Press Ctrl+C to terminate.'));

    process.on('SIGINT', async () => {
      console.log(pc.yellow('\nShutting down mock voice agent...'));
      await server.stop();
      process.exit(0);
    });
  });
