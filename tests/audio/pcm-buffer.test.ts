import { describe, it, expect } from 'vitest';
import {
  float32ToInt16,
  int16ToFloat32,
  stereoToMono,
  resamplePcm16,
  calculateRms,
  calculateDbfs,
  calculateZcr,
  createWavBuffer,
  parseWavBuffer,
} from '../../src/core/audio/pcm-buffer.js';

describe('pcm-buffer', () => {
  it('should accurately convert Float32Array to Int16 PCM buffer and back', () => {
    const input = new Float32Array([0.0, 0.5, -0.5, 1.0, -1.0]);
    const pcm = float32ToInt16(input);
    expect(pcm.length).toBe(input.length * 2);

    const reconstructed = int16ToFloat32(pcm);
    expect(reconstructed.length).toBe(input.length);
    for (let i = 0; i < input.length; i++) {
      expect(reconstructed[i]).toBeCloseTo(input[i], 2);
    }
  });

  it('should downmix interleaved stereo PCM to mono', () => {
    // 2 samples stereo: Left=1000, Right=3000 -> Mono=2000
    const stereo = Buffer.alloc(8);
    stereo.writeInt16LE(1000, 0); // L1
    stereo.writeInt16LE(3000, 2); // R1
    stereo.writeInt16LE(-2000, 4); // L2
    stereo.writeInt16LE(2000, 6); // R2

    const mono = stereoToMono(stereo, 2);
    expect(mono.length).toBe(4);
    expect(mono.readInt16LE(0)).toBe(2000);
    expect(mono.readInt16LE(2)).toBe(0);
  });

  it('should resample PCM audio between sample rates', () => {
    // 100 samples at 16kHz resampled to 24kHz (1.5x length)
    const floatArr = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      floatArr[i] = Math.sin((2 * Math.PI * i) / 10);
    }
    const inputPcm = float32ToInt16(floatArr);
    const resampled = resamplePcm16(inputPcm, 16000, 24000);

    const expectedSamples = Math.round((100 * 24000) / 16000);
    expect(resampled.length).toBe(expectedSamples * 2);
  });

  it('should calculate RMS, dBFS, and Zero-Crossing Rate', () => {
    // Silence buffer
    const silence = Buffer.alloc(960);
    expect(calculateRms(silence)).toBe(0);
    expect(calculateDbfs(silence)).toBe(-100);
    expect(calculateZcr(silence)).toBe(0);

    // Sine wave buffer at ~0.5 amplitude
    const floatArr = new Float32Array(480);
    for (let i = 0; i < floatArr.length; i++) {
      floatArr[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / 24000);
    }
    const sinePcm = float32ToInt16(floatArr);
    const rms = calculateRms(sinePcm);
    const dbfs = calculateDbfs(sinePcm);
    const zcr = calculateZcr(sinePcm);

    // RMS of 0.5 amplitude sine wave is ~0.5 / sqrt(2) ≈ 0.353
    expect(rms).toBeGreaterThan(0.3);
    expect(rms).toBeLessThan(0.4);
    expect(dbfs).toBeGreaterThan(-12);
    expect(dbfs).toBeLessThan(-6);
    expect(zcr).toBeGreaterThan(0);
  });

  it('should wrap and parse standard WAV buffers', () => {
    const rawPcm = Buffer.alloc(1000);
    rawPcm.fill(12);

    const wav = createWavBuffer(rawPcm, 24000, 1);
    expect(wav.length).toBe(1000 + 44);
    expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
    expect(wav.toString('ascii', 8, 12)).toBe('WAVE');

    const parsed = parseWavBuffer(wav);
    expect(parsed.sampleRate).toBe(24000);
    expect(parsed.channels).toBe(1);
    expect(parsed.pcmData.length).toBe(rawPcm.length);
  });
});
