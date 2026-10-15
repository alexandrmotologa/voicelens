import { Command } from 'commander';
import pc from 'picocolors';
import { exec } from 'child_process';
import { LocalServer } from '../../server/local-server.js';

export const studioCommand = new Command('studio')
  .description('Launch the embedded VoiceLens Web Studio with real-time audio oscilloscope and latency waterfall visualizer')
  .option('-p, --port <number>', 'Port for Web Studio', '50095')
  .option('--no-open', 'Do not automatically open browser on launch')
  .action(async (opts) => {
    const port = Number(opts.port) || 50095;
    const server = new LocalServer({ port });

    const actualPort = await server.start();
    const studioUrl = `http://localhost:${actualPort}`;

    console.log('');
    console.log(pc.bold(pc.cyan('VoiceLens Real-Time Latency Profiler Studio')));
    console.log(pc.dim('═'.repeat(60)));
    console.log(`  • ${pc.bold('Web Studio URL:')}    ${pc.green(studioUrl)}`);
    console.log(`  • ${pc.bold('Live Telemetry WS:')}  ws://localhost:${actualPort}/ws/live`);
    console.log(`  • ${pc.bold('Local Mock Agent:')}   ws://localhost:50096`);
    console.log('');
    console.log(pc.dim('Press Ctrl+C to stop the studio.'));

    if (opts.open !== false) {
      const openCmd = process.platform === 'win32'
        ? `start ${studioUrl}`
        : process.platform === 'darwin'
        ? `open ${studioUrl}`
        : `xdg-open ${studioUrl}`;
      exec(openCmd);
    }

    process.on('SIGINT', async () => {
      console.log(pc.yellow('\nStopping VoiceLens Studio...'));
      await server.stop();
      process.exit(0);
    });
  });
