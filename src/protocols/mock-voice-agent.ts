import { WebSocketServer, WebSocket } from 'ws';
import { createServer, Server } from 'http';
import { generateSyntheticUtterance } from '../core/audio/synthetic-voice.js';

export interface AcousticProfile {
  name: string;
  asrDurationMs: number;
  llmTtftMs: number;
  ttsTtfaMs: number;
  packetJitterVarianceMs: number;
  bargeInHaltDelayMs: number;
}

export const ACOUSTIC_PROFILES: Record<string, AcousticProfile> = {
  ultra_fast: {
    name: 'Ultra-Fast Sub-400ms Pipeline',
    asrDurationMs: 40,
    llmTtftMs: 90,
    ttsTtfaMs: 120,
    packetJitterVarianceMs: 3,
    bargeInHaltDelayMs: 65,
  },
  enterprise_standard: {
    name: 'Enterprise Production (500-650ms)',
    asrDurationMs: 80,
    llmTtftMs: 160,
    ttsTtfaMs: 220,
    packetJitterVarianceMs: 8,
    bargeInHaltDelayMs: 110,
  },
  congested_telephony: {
    name: 'Congested Telephony / Cellular (>800ms)',
    asrDurationMs: 180,
    llmTtftMs: 320,
    ttsTtfaMs: 420,
    packetJitterVarianceMs: 25,
    bargeInHaltDelayMs: 240,
  },
};

export interface MockServerOptions {
  port?: number;
  profileName?: keyof typeof ACOUSTIC_PROFILES;
  customProfile?: Partial<AcousticProfile>;
}

export class MockVoiceAgentServer {
  private httpServer: Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;
  private profile: AcousticProfile;
  private activeStreams: Map<WebSocket, { timer: NodeJS.Timeout | null; cancelled: boolean }> = new Map();

  constructor(options: MockServerOptions = {}) {
    this.port = options.port ?? 50096;
    const baseProfile = ACOUSTIC_PROFILES[options.profileName ?? 'enterprise_standard'] ?? ACOUSTIC_PROFILES.enterprise_standard;
    this.profile = {
      ...baseProfile,
      ...(options.customProfile ?? {}),
    };
  }

  public async start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.httpServer = createServer((req, res) => {
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', profile: this.profile }));
          return;
        }
        res.writeHead(404);
        res.end();
      });

      this.wss = new WebSocketServer({ server: this.httpServer });

      this.wss.on('connection', (ws) => {
        this.handleConnection(ws);
      });

      this.httpServer.listen(this.port, () => {
        const address = this.httpServer?.address();
        const actualPort = typeof address === 'object' && address ? address.port : this.port;
        this.port = actualPort;
        resolve(actualPort);
      });

      this.httpServer.on('error', reject);
    });
  }

  public setProfile(profileName: keyof typeof ACOUSTIC_PROFILES): void {
    if (ACOUSTIC_PROFILES[profileName]) {
      this.profile = { ...ACOUSTIC_PROFILES[profileName] };
    }
  }

  public getProfile(): AcousticProfile {
    return { ...this.profile };
  }

  public getPort(): number {
    return this.port;
  }

  private handleConnection(ws: WebSocket): void {
    const streamState = { timer: null as NodeJS.Timeout | null, cancelled: false };
    this.activeStreams.set(ws, streamState);

    // Send initial session created event
    ws.send(JSON.stringify({
      type: 'session.created',
      session: {
        id: 'sess_' + Math.random().toString(36).substring(2, 9),
        model: 'mock-realtime-voice',
        voice: 'alloy',
      },
    }));

    ws.on('message', (data: Buffer | string) => {
      try {
        const msg = JSON.parse(data.toString());
        this.handleClientMessage(ws, msg, streamState);
      } catch (err) {
        // Binary audio frame directly
      }
    });

    ws.on('close', () => {
      if (streamState.timer) clearTimeout(streamState.timer);
      this.activeStreams.delete(ws);
    });
  }

  private handleClientMessage(
    ws: WebSocket,
    msg: Record<string, unknown>,
    state: { timer: NodeJS.Timeout | null; cancelled: boolean }
  ): void {
    const msgType = msg.type as string;

    if (msgType === 'session.update') {
      ws.send(JSON.stringify({
        type: 'session.updated',
        session: msg.session,
      }));
    } else if (msgType === 'input_audio_buffer.append') {
      // Audio incoming from caller
    } else if (msgType === 'input_audio_buffer.commit' || msgType === 'response.create') {
      state.cancelled = false;
      this.scheduleResponse(ws, state);
    } else if (msgType === 'response.cancel') {
      state.cancelled = true;
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
      }
      setTimeout(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'response.cancelled',
            response: { id: 'resp_' + Date.now() },
          }));
        }
      }, this.profile.bargeInHaltDelayMs);
    }
  }

  private scheduleResponse(
    ws: WebSocket,
    state: { timer: NodeJS.Timeout | null; cancelled: boolean }
  ): void {
    const responseId = 'resp_' + Math.random().toString(36).substring(2, 9);

    // 1. ASR & TTFT delay
    const ttftDelay = this.profile.asrDurationMs + this.profile.llmTtftMs;
    state.timer = setTimeout(() => {
      if (state.cancelled || ws.readyState !== WebSocket.OPEN) return;

      ws.send(JSON.stringify({
        type: 'response.audio_transcript.delta',
        response_id: responseId,
        delta: 'Certainly, I can help you with that.',
      }));

      // 2. TTS audio generation delay (TTFA)
      state.timer = setTimeout(() => {
        if (state.cancelled || ws.readyState !== WebSocket.OPEN) return;

        this.streamAudioFrames(ws, responseId, state);
      }, this.profile.ttsTtfaMs);

    }, ttftDelay);
  }

  private streamAudioFrames(
    ws: WebSocket,
    responseId: string,
    state: { timer: NodeJS.Timeout | null; cancelled: boolean }
  ): void {
    // Generate synthetic audio for ~1.5s speech response
    const audioPcm = generateSyntheticUtterance({
      durationMs: 1500,
      sampleRate: 24000,
      vowelSequence: ['e', 'o', 'a', 'i'],
    });

    // 20ms frames at 24kHz 16-bit mono = 480 samples = 960 bytes
    const frameBytes = 960;
    let offset = 0;

    const sendNextFrame = () => {
      if (state.cancelled || ws.readyState !== WebSocket.OPEN) return;

      if (offset >= audioPcm.length) {
        ws.send(JSON.stringify({
          type: 'response.done',
          response: { id: responseId, status: 'completed' },
        }));
        return;
      }

      const end = Math.min(offset + frameBytes, audioPcm.length);
      const chunk = audioPcm.subarray(offset, end);
      offset = end;

      // Base64 audio delta
      ws.send(JSON.stringify({
        type: 'response.audio.delta',
        response_id: responseId,
        delta: chunk.toString('base64'),
      }));

      // Simulate interval with configurable jitter variance
      const jitterVariance = (Math.random() - 0.5) * 2 * this.profile.packetJitterVarianceMs;
      const nextInterval = Math.max(5, 20 + jitterVariance);

      state.timer = setTimeout(sendNextFrame, nextInterval);
    };

    sendNextFrame();
  }

  public async stop(): Promise<void> {
    for (const [, state] of this.activeStreams) {
      if (state.timer) clearTimeout(state.timer);
    }
    this.activeStreams.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    }
    if (this.httpServer) {
      await new Promise<void>((resolve) => this.httpServer?.close(() => resolve()));
    }
    this.wss = null;
    this.httpServer = null;
  }
}
