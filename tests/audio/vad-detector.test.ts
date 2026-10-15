import { describe, it, expect } from 'vitest';
import { VadDetector } from '../../src/core/audio/vad-detector.js';
import { generateSyntheticUtterance, generateDigitalSilence } from '../../src/core/audio/synthetic-voice.js';

describe('vad-detector', () => {
  it('should detect speech start and end with silence hangover delay', async () => {
    const vad = new VadDetector({
      sampleRate: 24000,
      frameDurationMs: 20,
      thresholdDbfs: -40,
      minSpeechDurationMs: 40,
      silenceHangoverMs: 200,
    });

    let speechStarted = false;
    let speechEnded = false;
    let measuredSilenceDelayMs = 0;

    vad.on('speech_start', () => {
      speechStarted = true;
    });

    vad.on('speech_end', (evt) => {
      speechEnded = true;
      measuredSilenceDelayMs = evt.silenceDelayMs;
    });

    // 1. Initial 100ms silence
    const silence1 = generateDigitalSilence(100, 24000);
    vad.processChunk(silence1);
    expect(speechStarted).toBe(false);

    // 2. 300ms speech burst
    const speech = generateSyntheticUtterance({
      durationMs: 300,
      sampleRate: 24000,
      amplitudeDbfs: -10,
    });
    vad.processChunk(speech);
    expect(speechStarted).toBe(true);
    expect(speechEnded).toBe(false);

    // 3. 300ms trailing silence (exceeds 200ms hangover threshold)
    const silence2 = generateDigitalSilence(300, 24000);
    vad.processChunk(silence2);
    expect(speechEnded).toBe(true);
    expect(measuredSilenceDelayMs).toBeGreaterThanOrEqual(180);
  });
});
