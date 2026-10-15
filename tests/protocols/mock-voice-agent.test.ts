import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MockVoiceAgentServer } from '../../src/protocols/mock-voice-agent.js';
import { OpenAiRealtimeProtocol } from '../../src/protocols/openai-realtime.js';

describe('mock voice agent & openai realtime protocol', () => {
  let server: MockVoiceAgentServer;
  let port: number;

  beforeAll(async () => {
    server = new MockVoiceAgentServer({
      port: 50110,
      profileName: 'ultra_fast',
    });
    port = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('should connect, stream audio frames, and complete response', async () => {
    const protocol = new OpenAiRealtimeProtocol({
      endpointUrl: `ws://localhost:${port}`,
    });

    await protocol.connect();
    expect(protocol.isConnected()).toBe(true);

    let firstTokenReceived = false;
    let audioFramesCount = 0;
    let responseCompleted = false;

    protocol.on('first_token', () => {
      firstTokenReceived = true;
    });

    protocol.on('audio_frame', (chunk) => {
      expect(chunk.length).toBeGreaterThan(0);
      audioFramesCount++;
    });

    protocol.on('response_completed', () => {
      responseCompleted = true;
    });

    // Send synthetic audio and commit
    const chunk = Buffer.alloc(960);
    chunk.fill(5);
    await protocol.sendAudioChunk(chunk);
    await protocol.commitAudio();
    await protocol.triggerResponse();

    // Wait for response to stream
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (responseCompleted) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(firstTokenReceived).toBe(true);
    expect(audioFramesCount).toBeGreaterThan(0);
    expect(responseCompleted).toBe(true);

    await protocol.disconnect();
    expect(protocol.isConnected()).toBe(false);
  });

  it('should halt streaming audio immediately on cancellation (barge-in)', async () => {
    const protocol = new OpenAiRealtimeProtocol({
      endpointUrl: `ws://localhost:${port}`,
    });

    await protocol.connect();

    let cancelled = false;
    let framesAfterCancel = 0;

    protocol.on('response_cancelled', () => {
      cancelled = true;
    });

    protocol.on('audio_frame', () => {
      if (cancelled) {
        framesAfterCancel++;
      }
    });

    await protocol.commitAudio();
    await protocol.triggerResponse();

    // Wait for first token, then cancel
    await new Promise<void>((resolve) => {
      protocol.once('first_token', async () => {
        await protocol.cancelResponse();
        resolve();
      });
    });

    // Wait for cancellation event
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (cancelled) {
          clearInterval(check);
          resolve();
        }
      }, 30);
    });

    expect(cancelled).toBe(true);
    // Buffer bleed must be near zero
    expect(framesAfterCancel).toBeLessThanOrEqual(2);

    await protocol.disconnect();
  });
});
