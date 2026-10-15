import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockVoiceAgentServer } from '../../src/protocols/mock-voice-agent.js';
import { OpenAiRealtimeProtocol } from '../../src/protocols/openai-realtime.js';
import { BenchmarkSuite } from '../../src/core/runner/benchmark-suite.js';

describe('benchmark suite execution', () => {
  let server: MockVoiceAgentServer;
  let port: number;

  beforeAll(async () => {
    server = new MockVoiceAgentServer({
      port: 50115,
      profileName: 'ultra_fast',
    });
    port = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should run a multi-turn benchmark and return turn metrics with barge-in', async () => {
    const protocol = new OpenAiRealtimeProtocol({
      endpointUrl: `ws://localhost:${port}`,
    });

    const suite = new BenchmarkSuite({
      protocol,
      scenarios: [
        {
          id: 'test_turn_1',
          transcript: 'Short inquiry for benchmark testing',
          durationMs: 300,
          silenceAfterMs: 150,
          testBargeIn: false,
        },
        {
          id: 'test_turn_2_barge_in',
          transcript: 'Turn testing interruption responsiveness',
          durationMs: 300,
          silenceAfterMs: 150,
          testBargeIn: true,
          bargeInOffsetMs: 150,
        },
      ],
      bargeInToleranceMs: 180,
    });

    const result = await suite.run();
    await protocol.disconnect();

    expect(result.turns.length).toBe(2);
    expect(result.bargeIns.length).toBe(1);

    const b = result.bargeIns[0];
    expect(b.interruptionResponseDelayMs).toBeGreaterThan(0);
    expect(b.interruptionResponseDelayMs).toBeLessThanOrEqual(180);
    expect(b.passedSla).toBe(true);

    expect(result.summary.totalTurns).toBe(2);
    expect(result.summary.turnaroundStats.mean).toBeGreaterThan(0);
    expect(result.summary.totalAudioPackets).toBeGreaterThan(0);
    expect(result.summary.jitterHistogram.length).toBe(6);
    expect(result.turns[0].audioPacketCount).toBeGreaterThan(0);
    expect(result.turns[0].audioBytesReceived).toBeGreaterThan(0);
    expect(result.turns[0].jitterReport).toBeDefined();
  }, 20000);
});
