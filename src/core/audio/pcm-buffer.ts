/**
 * High-performance Linear PCM Audio Buffer & DSP Utilities.
 * Handles 16-bit linear PCM conversion, resampling, RMS/dBFS energy, and WAV serialization.
 */

export interface AudioFormat {
  sampleRate: number; // e.g., 8000, 16000, 24000, 48000
  channels: number;   // 1 = mono, 2 = stereo
  bitDepth: 16;       // 16-bit linear PCM
}

export const DEFAULT_AUDIO_FORMAT: AudioFormat = {
  sampleRate: 24000,
  channels: 1,
  bitDepth: 16,
};

/**
 * Converts a Float32Array (-1.0 to 1.0) into 16-bit signed PCM Buffer (little-endian).
 */
export function float32ToInt16(input: Float32Array): Buffer {
  const output = Buffer.alloc(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    const intSample = s < 0 ? s * 0x8000 : s * 0x7fff;
    output.writeInt16LE(Math.floor(intSample), i * 2);
  }
  return output;
}

/**
 * Converts a 16-bit signed PCM Buffer (little-endian) into Float32Array (-1.0 to 1.0).
 */
export function int16ToFloat32(buffer: Buffer): Float32Array {
  const sampleCount = Math.floor(buffer.length / 2);
  const output = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const intSample = buffer.readInt16LE(i * 2);
    output[i] = intSample < 0 ? intSample / 32768 : intSample / 32767;
  }
  return output;
}

/**
 * Converts multi-channel interleaved PCM buffer to mono by averaging channels.
 */
export function stereoToMono(buffer: Buffer, channels = 2): Buffer {
  if (channels === 1) return buffer;
  const sampleCount = Math.floor(buffer.length / (2 * channels));
  const output = Buffer.alloc(sampleCount * 2);

  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      sum += buffer.readInt16LE((i * channels + c) * 2);
    }
    const monoSample = Math.round(sum / channels);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, monoSample)), i * 2);
  }
  return output;
}

/**
 * Resamples 16-bit mono PCM buffer from source sample rate to target sample rate
 * using linear interpolation.
 */
export function resamplePcm16(
  input: Buffer,
  sourceRate: number,
  targetRate: number
): Buffer {
  if (sourceRate === targetRate || input.length === 0) return input;

  const inFloat = int16ToFloat32(input);
  const ratio = sourceRate / targetRate;
  const outLength = Math.round(inFloat.length / ratio);
  const outFloat = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcIndex = i * ratio;
    const indexLow = Math.floor(srcIndex);
    const indexHigh = Math.min(indexLow + 1, inFloat.length - 1);
    const frac = srcIndex - indexLow;

    const sampleLow = inFloat[indexLow] ?? 0;
    const sampleHigh = inFloat[indexHigh] ?? sampleLow;
    outFloat[i] = sampleLow + frac * (sampleHigh - sampleLow);
  }

  return float32ToInt16(outFloat);
}

/**
 * Calculates Root Mean Square (RMS) amplitude of a 16-bit PCM buffer (0.0 to 1.0).
 */
export function calculateRms(buffer: Buffer): number {
  if (buffer.length < 2) return 0;
  const sampleCount = Math.floor(buffer.length / 2);
  let sumSq = 0;

  for (let i = 0; i < sampleCount; i++) {
    const sample = buffer.readInt16LE(i * 2) / 32768.0;
    sumSq += sample * sample;
  }

  return Math.sqrt(sumSq / sampleCount);
}

/**
 * Computes dBFS (decibels relative to full scale) of an audio buffer.
 * Full scale sine wave = ~ -3 dBFS; digital silence = -Infinity (clamped to -100).
 */
export function calculateDbfs(buffer: Buffer): number {
  const rms = calculateRms(buffer);
  if (rms <= 0.00001) return -100;
  const db = 20 * Math.log10(rms);
  return Math.max(-100, Math.min(0, db));
}

/**
 * Computes Zero Crossing Rate (ZCR) of a 16-bit PCM buffer.
 * High ZCR often correlates with fricative consonants or high-frequency background noise.
 */
export function calculateZcr(buffer: Buffer): number {
  if (buffer.length < 4) return 0;
  const sampleCount = Math.floor(buffer.length / 2);
  let crossings = 0;
  let prevSample = buffer.readInt16LE(0);

  for (let i = 1; i < sampleCount; i++) {
    const currentSample = buffer.readInt16LE(i * 2);
    if ((prevSample >= 0 && currentSample < 0) || (prevSample < 0 && currentSample >= 0)) {
      crossings++;
    }
    prevSample = currentSample;
  }

  return crossings / (sampleCount - 1);
}

/**
 * Wraps raw 16-bit PCM mono audio in a standard 44-byte RIFF/WAV header.
 */
export function createWavBuffer(pcmData: Buffer, sampleRate = 24000, channels = 1): Buffer {
  const byteRate = sampleRate * channels * 2;
  const blockAlign = channels * 2;
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);

  // RIFF identifier
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);

  // fmt subchunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // subchunk1 size (16 for PCM)
  header.writeUInt16LE(1, 20);  // audio format (1 = PCM)
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(16, 34); // bits per sample

  // data subchunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Extracts raw 16-bit PCM audio from a WAV buffer.
 */
export function parseWavBuffer(wavBuffer: Buffer): {
  pcmData: Buffer;
  sampleRate: number;
  channels: number;
} {
  if (wavBuffer.toString('ascii', 0, 4) !== 'RIFF' || wavBuffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV file header');
  }

  const channels = wavBuffer.readUInt16LE(22);
  const sampleRate = wavBuffer.readUInt32LE(24);
  
  // Find 'data' chunk
  let offset = 12;
  while (offset < wavBuffer.length - 8) {
    const chunkId = wavBuffer.toString('ascii', offset, offset + 4);
    const chunkSize = wavBuffer.readUInt32LE(offset + 4);
    if (chunkId === 'data') {
      const pcmData = wavBuffer.subarray(offset + 8, offset + 8 + chunkSize);
      return { pcmData, sampleRate, channels };
    }
    offset += 8 + chunkSize;
  }

  // Fallback if standard offset
  const pcmData = wavBuffer.subarray(44);
  return { pcmData, sampleRate, channels };
}
