# Engineering Specification & Implementation Blueprint: VoiceLens
> Real-Time Voice AI Latency Profiler, Audio Stream Benchmarking Studio & Barge-in Test Harness

---

## 1. Executive Summary & Problem Space

### 1.1 The Voice AI Latency Trap
With the rise of full-duplex conversational voice models (OpenAI Realtime API, AWS Nova Sonic, LiveKit, ElevenLabs, Deepgram), real-time speech interfaces are replacing traditional chatbots in customer contact centers (Amazon Connect, Centrica, enterprise banking).

However, voice agents succeed or fail on a strict human perception threshold:
* If the turnaround latency (silence to hearing the first audio response) exceeds **600-800 milliseconds**, users perceive an awkward delay and talk over the agent.
* If the interruption latency (**barge-in**) exceeds **200 milliseconds**, the agent talks over the user, creating a broken conversational experience.

Engineering teams currently have no standardized, open-source tool to dissect the real-time audio pipeline:
1. **Opaque Latency Attribution:** When an agent feels slow, is the bottleneck in the client-side Voice Activity Detection (VAD) silence threshold, network transport (WebRTC/WebSocket), speech-to-text transcription, LLM Time-to-First-Token (TTFT), or Text-to-Speech audio chunk streaming?
2. **Untested Barge-in Responsiveness:** Testing whether an agent immediately mutes and clears its audio buffer when interrupted requires subjective manual phone calls instead of automated regression benchmarks.
3. **Audio Packet Jitter & Buffer Underflows:** Packets arriving out of order or bursty audio frames cause audible clicks, pops, and stuttering that cannot be caught with conventional HTTP load testing tools.

### 1.2 The Solution: VoiceLens
**VoiceLens** is a single-binary CLI and embedded Web Studio built in **TypeScript and React 19** that provides end-to-end latency profiling, waterfall timing breakdowns, and automated acoustic regression testing for real-time voice AI agents.

* **Full-Duplex Latency Decomposition:** Accurately measures and attributes latency across every hop:
  * `t_vad`: Voice Activity Detection silence confirmation.
  * `t_net_up`: Audio uplink transmission.
  * `t_ttft`: LLM Time to First Token.
  * `t_ttfa`: Text-to-Speech Time to First Audio Byte.
  * `t_playback`: Buffer scheduling and speaker playback.
* **Automated Barge-In & Interruption Harness:** Emulates user speech interruptions at precise millisecond intervals (`+200ms`, `+500ms`, `+1200ms` into agent speech) and verifies that the agent halts streaming audio within target tolerance (< 180ms).
* **Live Audio Oscilloscope & Waterfall Studio:** An embedded React 19 Web Studio featuring interactive waveform visualizers, audio packet jitter histograms, and live waterfall timelines.
* **Provider Adapters:** Native support for WebSocket and WebRTC audio protocols across OpenAI Realtime API, AWS Nova Sonic / Amazon Connect, LiveKit, and custom self-hosted speech pipelines.

---

## 2. System Architecture & Tech Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                          VoiceLens Architecture                        │
└────────────────────────────────────────────────────────────────────────┘

[ CLI: npx voicelens ]  OR  [ Embedded Web Studio ] (http://localhost:50095)
                             │
                             ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      VoiceLens Core Engine                             │
├────────────────────────────────────────────────────────────────────────┤
│  Audio Ingestion & Synthetic Caller                                    │
│    ├── PCM 16-bit / 24kHz Audio Streamer                               │
│    ├── WebRTC Data & Media Channel Connector                           │
│    └── Full-Duplex WebSocket Protocol Gateway                          │
├────────────────────────────────────────────────────────────────────────┤
│  Acoustic Timing & Profiling Engine                                    │
│    ├── High-Resolution Nanosecond Timestamp Clock                      │
│    ├── VAD (Silero VAD / Energy Threshold) Calibration                 │
│    ├── TTFA (Time to First Audio Byte) Waterfall Dissector             │
│    └── Interruption / Barge-In Response Timer                          │
├────────────────────────────────────────────────────────────────────────┤
│  Protocol Adapters                                                     │
│    ├── OpenAI Realtime Protocol Adapter                                │
│    ├── AWS Nova Sonic / Amazon Connect Adapter                         │
│    └── Standard WebRTC / LiveKit Media Adapter                         │
├────────────────────────────────────────────────────────────────────────┤
│  Report & Benchmark Exporter                                           │
│    ├── Latency Budget Compliance (Pass / Fail Thresholds)              │
│    └── Markdown Waterfall Summary & JSON Export                        │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack Choices
* **Runtime:** Node.js 22 LTS / TypeScript 5.6+
* **Audio Protocols:** `ws` (WebSockets) + `node-datachannel` / `@roamhq/wrtc` (WebRTC)
* **Audio DSP:** Linear PCM 16-bit, 8kHz (Telephony) and 24kHz / 48kHz audio buffers
* **Web Studio:** React 19 + Vite 6 + Tailwind CSS (bundled statically with Canvas Web Audio oscilloscope)
* **CLI Engine:** Commander.js + Picocolors + Ora + Table

---

## 3. Directory & File Structure

```
voicelens/
├── bin/
│   └── voicelens.js                # CLI executable entry point
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── benchmark.ts        # voicelens benchmark --target <ws-url> --scenario <file.json>
│   │   │   ├── record.ts           # voicelens record --listen <port>
│   │   │   └── studio.ts           # voicelens studio (Launches embedded visual profiler)
│   │   └── index.ts
│   ├── core/
│   │   ├── audio/
│   │   │   ├── pcm-buffer.ts       # PCM format converters (resampling, stereo to mono)
│   │   │   ├── synthetic-voice.ts  # Pre-recorded golden voice query generator
│   │   │   └── vad-detector.ts     # Client-side Voice Activity Detection simulator
│   │   ├── metrics/
│   │   │   ├── barge-in.ts         # Interruption response time calculator
│   │   │   ├── jitter.ts           # Audio frame packet arrival variance
│   │   │   └── waterfall.ts        # Turnaround timeline segmentation (TTFT vs TTFA)
│   │   └── runner/
│   │       ├── benchmark-suite.ts  # Multi-turn conversation scenario runner
│   │       └── budget-evaluator.ts # Latency budget compliance checker (<800ms)
│   ├── protocols/
│   │   ├── base.ts                 # BaseVoiceProtocol interface
│   │   ├── aws-nova-sonic.ts       # AWS Nova Sonic / Bedrock audio streaming protocol
│   │   ├── livekit-webrtc.ts       # LiveKit WebRTC client adapter
│   │   └── openai-realtime.ts      # OpenAI Realtime WebSocket protocol adapter
│   ├── server/
│   │   ├── api-router.ts           # REST API endpoints for the Studio
│   │   └── local-server.ts         # Embedded HTTP & WebSocket server
│   └── studio/                     # React 19 Frontend Web Studio
│       ├── index.html
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── AudioOscilloscope.tsx   # Canvas visualizer for speech waveform
│       │   │   ├── BargeInTester.tsx       # Interactive interruption simulator
│       │   │   ├── LatencyWaterfall.tsx    # Visual color-coded timeline bars
│       │   │   └── MetricStatCards.tsx     # TTFT, TTFA, Jitter, Budget badges
│       │   ├── styles/
│       │   │   └── index.css
│       │   └── main.tsx
│       └── vite.config.ts
├── tests/
│   ├── audio/
│   │   ├── pcm-buffer.test.ts
│   │   └── vad-detector.test.ts
│   └── metrics/
│       └── waterfall.test.ts
├── fixtures/
│   ├── golden-speech-sample.pcm
│   └── conversation-scenarios.json
├── package.json
├── tsconfig.json
└── README.md
```

---

## 4. Core Data Contracts & Interfaces

```typescript
// src/core/metrics/waterfall.ts
export interface VoiceTurnMetrics {
  turnId: string;
  userSpeechDurationMs: number;
  vadSilenceDelayMs: number;       // Time from user stopped speaking to VAD trigger
  networkUplinkMs: number;          // Time for audio frame to reach server
  serverProcessingMs: number;       // Server side ASR + LLM computation
  timeToFirstTokenMs: number;       // First generated token event
  timeToFirstAudioByteMs: number;   // First audio chunk received by client (TTFA)
  totalTurnaroundMs: number;        // End of user speech to start of agent playback
  audioPlaybackDurationMs: number;
  jitterMs: number;
  budgetStatus: 'pass' | 'warning' | 'fail'; // e.g. <600ms = pass, 600-800ms = warning, >800ms = fail
}

export interface BargeInMetrics {
  interruptionInitiatedAtMs: number; // Offset into agent speech when user interrupted
  agentAudioHaltedAtMs: number;      // Exact timestamp when agent stream terminated
  interruptionResponseDelayMs: number; // Target < 180ms
  discardedAudioFramesCount: number;
  cleanCutoff: boolean;              // True if audio did not buffer-bleed into next turn
}
```

---

## 5. Implementation Roadmap (Phases 1-5)

### Phase 1: Audio Core & Timestamping Engine
* Implement `pcm-buffer.ts` for PCM 16-bit mono 24kHz encoding, slicing, and resampling.
* Implement synthetic golden speech generator using pre-recorded phonetic wav/pcm files.
* Build high-precision microsecond timestamp logger for event tagging.

### Phase 2: Protocol Adapters
* Build `openai-realtime.ts` implementing `session.update`, `input_audio_buffer.append`, and `response.audio.delta` listeners.
* Build `aws-nova-sonic.ts` matching AWS Bedrock Nova Sonic streaming audio specifications.
* Build local mock voice echo server for deterministic, zero-cost unit and CI testing.

### Phase 3: Latency Decomposition & Barge-In Evaluator
* Calculate exact time deltas for VAD silence, TTFT, and TTFA.
* Implement `barge-in.ts` injecting synthetic speech bursts while agent audio is streaming and asserting that cancellation completes under 180ms.
* Output structured terminal tables with colored status badges (`PASS <600ms`, `WARN 600-800ms`, `FAIL >800ms`).

### Phase 4: Embedded React 19 Web Studio
* Build interactive HTML5 Canvas oscilloscope displaying user audio and agent response waveforms.
* Build visual Latency Waterfall showing horizontal stacked bars for VAD, Network, LLM, and TTS chunks.
* Add manual Barge-In button allowing developers to trigger live interruptions and watch latency graphs update in real time.

### Phase 5: CI Integration & Documentation
* Support automated CI assertions (`voicelens benchmark --max-ttfa 750 --fail-on-budget`).
* Export Markdown benchmark tables suitable for automated PR reports.
* Write humanized `README.md` with demo GIF and architecture diagram.
