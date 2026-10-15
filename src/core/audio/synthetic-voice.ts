import { float32ToInt16, createWavBuffer } from './pcm-buffer.js';

export interface FormantPreset {
  name: string;
  f0: number; // fundamental frequency (Hz)
  f1: number; // First formant (vowel height)
  f2: number; // Second formant (vowel backness)
  f3: number; // Third formant
}

// Standard English acoustic vowel formant presets
export const VOWEL_PRESETS: Record<string, FormantPreset> = {
  a: { name: 'open-a', f0: 140, f1: 730, f2: 1090, f3: 2440 }, // "ah"
  i: { name: 'close-i', f0: 155, f1: 270, f2: 2290, f3: 3010 }, // "ee"
  u: { name: 'close-u', f0: 135, f1: 300, f2: 870, f3: 2240 },  // "oo"
  e: { name: 'mid-e', f0: 145, f1: 530, f2: 1840, f3: 2480 },   // "eh"
  o: { name: 'mid-o', f0: 130, f1: 570, f2: 840, f3: 2410 },    // "oh"
};

export interface SyntheticSpeechOptions {
  sampleRate?: number;       // default: 24000
  durationMs: number;        // length of speech burst
  silenceAfterMs?: number;   // trailing silence
  vowelSequence?: string[];  // e.g. ['a', 'e', 'i', 'o', 'u']
  pitchJitter?: boolean;     // add natural human pitch modulation
  amplitudeDbfs?: number;    // default: -12 dBFS
}

/**
 * Generates natural phonetic speech bursts using additive formant resonance synthesis.
 * Simulates human vocal tract acoustics at 16-bit linear PCM.
 */
export function generateSyntheticUtterance(options: SyntheticSpeechOptions): Buffer {
  const sampleRate = options.sampleRate ?? 24000;
  const totalDurationMs = options.durationMs + (options.silenceAfterMs ?? 0);
  const totalSamples = Math.floor((sampleRate * totalDurationMs) / 1000);
  const speechSamples = Math.floor((sampleRate * options.durationMs) / 1000);

  const buffer = new Float32Array(totalSamples);
  const vowels = options.vowelSequence ?? ['a', 'e', 'i', 'o', 'u'];
  const samplesPerVowel = Math.floor(speechSamples / vowels.length);

  const baseAmp = Math.pow(10, (options.amplitudeDbfs ?? -12) / 20);

  let phaseF0 = 0;
  let phaseF1 = 0;
  let phaseF2 = 0;
  let phaseF3 = 0;

  for (let i = 0; i < speechSamples; i++) {
    const vowelIdx = Math.min(Math.floor(i / samplesPerVowel), vowels.length - 1);
    const vowelKey = vowels[vowelIdx] ?? 'a';
    const preset = VOWEL_PRESETS[vowelKey] ?? VOWEL_PRESETS['a'];

    // Natural vocal pitch intonation (slight downward contour + vibrato)
    const progress = i / speechSamples;
    const intonation = 1.0 - 0.15 * progress;
    const vibrato = 1.0 + 0.02 * Math.sin(2 * Math.PI * 5.5 * (i / sampleRate));
    const currentF0 = preset.f0 * intonation * vibrato;

    // Phase increments
    phaseF0 += (2 * Math.PI * currentF0) / sampleRate;
    phaseF1 += (2 * Math.PI * preset.f1) / sampleRate;
    phaseF2 += (2 * Math.PI * preset.f2) / sampleRate;
    phaseF3 += (2 * Math.PI * preset.f3) / sampleRate;

    // Glottal excitation pulse (sawtooth-like waveform)
    const glottalPulse = Math.sin(phaseF0) + 0.5 * Math.sin(2 * phaseF0) + 0.25 * Math.sin(3 * phaseF0);

    // Formant resonances
    const sF1 = 0.5 * Math.sin(phaseF1);
    const sF2 = 0.3 * Math.sin(phaseF2);
    const sF3 = 0.15 * Math.sin(phaseF3);

    // Envelope: attack (40ms), sustain, decay (60ms)
    const attackSamples = Math.floor((sampleRate * 0.04));
    const decaySamples = Math.floor((sampleRate * 0.06));
    let env = 1.0;
    if (i < attackSamples) {
      env = i / attackSamples;
    } else if (i > speechSamples - decaySamples) {
      env = (speechSamples - i) / decaySamples;
    }

    // Combine glottal pulse and resonances
    const sampleVal = baseAmp * env * (glottalPulse * 0.4 + sF1 + sF2 + sF3);
    buffer[i] = Math.max(-1.0, Math.min(1.0, sampleVal));
  }

  // Trailing silence stays 0.0
  return float32ToInt16(buffer);
}

export interface GoldenUtterance {
  id: string;
  transcript: string;
  durationMs: number;
  silenceAfterMs: number;
  audioPcm: Buffer;
}

/**
 * Pre-packages standard conversational scenario utterances for zero-cost repeatable benchmarking.
 */
export function getGoldenUtterances(sampleRate = 24000): GoldenUtterance[] {
  return [
    {
      id: 'greeting_help',
      transcript: 'Hello, can you help me check my current account balance?',
      durationMs: 1400,
      silenceAfterMs: 400,
      audioPcm: generateSyntheticUtterance({
        sampleRate,
        durationMs: 1400,
        silenceAfterMs: 400,
        vowelSequence: ['e', 'o', 'a', 'u', 'i'],
      }),
    },
    {
      id: 'weather_query',
      transcript: 'What is the weather forecast for tomorrow morning?',
      durationMs: 1600,
      silenceAfterMs: 400,
      audioPcm: generateSyntheticUtterance({
        sampleRate,
        durationMs: 1600,
        silenceAfterMs: 400,
        vowelSequence: ['o', 'a', 'e', 'i', 'o'],
      }),
    },
    {
      id: 'barge_in_burst',
      transcript: 'Wait, stop! That is not what I asked for.',
      durationMs: 500,
      silenceAfterMs: 200,
      audioPcm: generateSyntheticUtterance({
        sampleRate,
        durationMs: 500,
        silenceAfterMs: 200,
        vowelSequence: ['a', 'o', 'i'],
        amplitudeDbfs: -8, // Louder interrupt burst
      }),
    },
  ];
}

/**
 * Generates an audio buffer containing standard digital silence (zeroes).
 */
export function generateDigitalSilence(durationMs: number, sampleRate = 24000): Buffer {
  const sampleCount = Math.floor((sampleRate * durationMs) / 1000);
  return Buffer.alloc(sampleCount * 2);
}
