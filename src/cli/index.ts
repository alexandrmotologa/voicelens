import { Command } from 'commander';
import { benchmarkCommand } from './commands/benchmark.js';
import { bargeInCommand } from './commands/barge-in.js';
import { mockServerCommand } from './commands/mock-server.js';
import { studioCommand } from './commands/studio.js';

const program = new Command();

program
  .name('voicelens')
  .description('Real-Time Voice AI Latency Profiler, Audio Stream Benchmarking Studio & Barge-in Test Harness')
  .version('1.0.0');

program.addCommand(benchmarkCommand);
program.addCommand(bargeInCommand);
program.addCommand(mockServerCommand);
program.addCommand(studioCommand);

program.parse(process.argv);
