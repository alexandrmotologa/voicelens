import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApiRouter } from './api-router.js';
import { MockVoiceAgentServer } from '../protocols/mock-voice-agent.js';
import { OpenAiRealtimeProtocol } from '../protocols/openai-realtime.js';
import { BenchmarkSuite, TurnScenario } from '../core/runner/benchmark-suite.js';
import { calculateRms, createWavBuffer } from '../core/audio/pcm-buffer.js';
import { generateSyntheticUtterance } from '../core/audio/synthetic-voice.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LocalServerOptions {
  port?: number;
  studioStaticDir?: string;
}

export class LocalServer {
  private server: Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number;
  private staticDir: string;
  private apiRouter: ApiRouter;
  private mockServer: MockVoiceAgentServer | null = null;
  private connectedWsClients: Set<WebSocket> = new Set();
  private turnAudioMap: Map<string, { caller: Buffer[]; agent: Buffer[] }> = new Map();

  constructor(options: LocalServerOptions = {}) {
    this.port = options.port ?? 50095;
    const defaultStatic = [
      path.resolve(__dirname, 'studio'),
      path.resolve(__dirname, '../dist/studio'),
      path.resolve(process.cwd(), 'dist/studio'),
    ].find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), 'dist/studio');
    this.staticDir = options.studioStaticDir ?? defaultStatic;
    this.apiRouter = new ApiRouter();
    this.setupApiHandlers();
  }

  public async start(): Promise<number> {
    // Start local mock voice agent on port 50096
    this.mockServer = new MockVoiceAgentServer({ port: 50096 });
    await this.mockServer.start();

    return new Promise((resolve, reject) => {
      this.server = createServer(async (req, res) => {
        // CORS preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }

        // Try API routes first
        const handledByApi = await this.apiRouter.handle(req, res);
        if (handledByApi) return;

        // Otherwise serve static studio SPA
        this.serveStatic(req, res);
      });

      this.wss = new WebSocketServer({ server: this.server, path: '/ws/live' });

      this.wss.on('connection', (ws) => {
        this.connectedWsClients.add(ws);
        ws.send(JSON.stringify({ type: 'connected', timestamp: Date.now() }));

        ws.on('message', (rawData) => {
          try {
            const msg = JSON.parse(rawData.toString());
            if (msg.type === 'mic_chunk' && msg.chunkBase64) {
              const buffer = Buffer.from(msg.chunkBase64, 'base64');
              const rms = calculateRms(buffer);
              this.broadcastWs({
                type: 'audio_level',
                channel: 'caller',
                level: rms,
                timestampMs: Date.now(),
              });
            }
          } catch {
            // ignore malformed ws message
          }
        });

        ws.on('close', () => {
          this.connectedWsClients.delete(ws);
        });
      });

      this.server.listen(this.port, () => {
        const address = this.server?.address();
        const actualPort = typeof address === 'object' && address ? address.port : this.port;
        this.port = actualPort;
        resolve(actualPort);
      });

      this.server.on('error', reject);
    });
  }

  private setupApiHandlers(): void {
    this.apiRouter.register('POST /api/benchmark/run', async (req, res, body) => {
      try {
        const targetEndpoint = (body?.targetEndpoint as string) || `ws://localhost:50096`;
        const profileName = (body?.profileName as string) || 'enterprise_standard';
        const apiKey = body?.apiKey as string | undefined;

        if (this.mockServer && targetEndpoint.includes('50096')) {
          this.mockServer.setProfile(profileName as any);
        }

        const protocol = new OpenAiRealtimeProtocol({
          endpointUrl: targetEndpoint,
          apiKey,
        });

        // Parse custom scenarios if sent from Web Studio
        const rawScenarios = body?.scenarios as Array<{
          id: string;
          transcript: string;
          durationMs?: number;
          testBargeIn?: boolean;
          bargeInOffsetMs?: number;
        }> | undefined;

        let suiteScenarios: TurnScenario[] | undefined;
        if (Array.isArray(rawScenarios) && rawScenarios.length > 0) {
          suiteScenarios = rawScenarios.map((s, idx) => ({
            id: s.id || `turn_${idx + 1}`,
            transcript: s.transcript,
            durationMs: s.durationMs ?? 1400,
            testBargeIn: !!s.testBargeIn,
            bargeInOffsetMs: s.bargeInOffsetMs ?? 400,
          }));
        }

        const suite = new BenchmarkSuite({ protocol, scenarios: suiteScenarios });

        // Forward real-time events to connected Studio UI clients and store audio
        suite.on('turn_start', (data) => {
          this.turnAudioMap.set(data.turnId, { caller: [], agent: [] });
          this.broadcastWs({
            type: 'turn_start',
            turnId: data.turnId,
            index: data.index,
            total: data.total,
          });
        });

        suite.on('caller_frame', (data) => {
          const entry = this.turnAudioMap.get(data.turnId);
          if (entry) entry.caller.push(data.chunk);

          const rms = calculateRms(data.chunk);
          this.broadcastWs({
            type: 'audio_level',
            channel: 'caller',
            level: rms,
            timestampMs: data.timestampMs,
          });
        });

        suite.on('audio_frame', (data) => {
          const entry = this.turnAudioMap.get(data.turnId);
          if (entry) entry.agent.push(data.chunk);

          const rms = calculateRms(data.chunk);
          this.broadcastWs({
            type: 'audio_level',
            channel: 'agent',
            level: rms,
            timestampMs: data.timestampMs,
            chunkBase64: data.chunk.toString('base64'),
          });
        });

        suite.on('barge_in_triggered', (data) => {
          this.broadcastWs({
            type: 'audio_stop',
            turnId: data.turnId,
            reason: 'barge_in',
          });
        });

        suite.on('turn_end', (data) => {
          this.broadcastWs({
            type: 'audio_stop',
            turnId: data.turnId,
            reason: 'turn_end',
          });
          this.broadcastWs({
            type: 'turn_result',
            turn: data.metrics,
            bargeIn: data.bargeIn,
          });
        });

        const result = await suite.run();
        await protocol.disconnect();

        this.apiRouter.sendJson(res, 200, {
          success: true,
          summary: result.summary,
          turns: result.turns,
          bargeIns: result.bargeIns,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Benchmark execution failed';
        this.apiRouter.sendJson(res, 500, { error: message });
      }
    });

    this.apiRouter.register('POST /api/barge-in/test', async (req, res, body) => {
      try {
        const targetEndpoint = (body?.targetEndpoint as string) || `ws://localhost:50096`;
        const offsetMs = Number(body?.offsetMs) || 350;
        const profileName = (body?.profileName as string) || 'enterprise_standard';

        if (this.mockServer && targetEndpoint.includes('50096')) {
          this.mockServer.setProfile(profileName as any);
        }

        const protocol = new OpenAiRealtimeProtocol({ endpointUrl: targetEndpoint });
        const suite = new BenchmarkSuite({
          protocol,
          scenarios: [
            {
              id: 'barge_in_test',
              transcript: 'Testing barge-in interruption cutoff responsiveness',
              testBargeIn: true,
              bargeInOffsetMs: offsetMs,
            },
          ],
        });

        suite.on('turn_start', (data) => {
          this.turnAudioMap.set(data.turnId, { caller: [], agent: [] });
          this.broadcastWs({
            type: 'turn_start',
            turnId: data.turnId,
            index: data.index,
            total: data.total,
          });
        });

        suite.on('caller_frame', (data) => {
          const entry = this.turnAudioMap.get(data.turnId);
          if (entry) entry.caller.push(data.chunk);

          const rms = calculateRms(data.chunk);
          this.broadcastWs({
            type: 'audio_level',
            channel: 'caller',
            level: rms,
            timestampMs: data.timestampMs,
          });
        });

        suite.on('audio_frame', (data) => {
          const entry = this.turnAudioMap.get(data.turnId);
          if (entry) entry.agent.push(data.chunk);

          const rms = calculateRms(data.chunk);
          this.broadcastWs({
            type: 'audio_level',
            channel: 'agent',
            level: rms,
            timestampMs: data.timestampMs,
            chunkBase64: data.chunk.toString('base64'),
          });
        });

        suite.on('barge_in_triggered', (data) => {
          this.broadcastWs({
            type: 'audio_stop',
            turnId: data.turnId,
            reason: 'barge_in',
          });
        });

        suite.on('turn_end', (data) => {
          this.broadcastWs({
            type: 'audio_stop',
            turnId: data.turnId,
            reason: 'turn_end',
          });
        });

        const result = await suite.run();
        await protocol.disconnect();

        this.apiRouter.sendJson(res, 200, {
          success: true,
          bargeIn: result.bargeIns[0],
          turn: result.turns[0],
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Barge-in test failed';
        this.apiRouter.sendJson(res, 500, { error: message });
      }
    });

    // Chaos simulator configuration endpoint
    this.apiRouter.register('POST /api/network/chaos', async (req, res, body) => {
      try {
        const artificialRttMs = typeof body?.artificialRttMs === 'number' ? body.artificialRttMs : 0;
        const packetLossPercent = typeof body?.packetLossPercent === 'number' ? body.packetLossPercent : 0;
        const jitterVarianceMs = typeof body?.jitterVarianceMs === 'number' ? body.jitterVarianceMs : 0;

        if (this.mockServer) {
          this.mockServer.setChaos({ artificialRttMs, packetLossPercent, jitterVarianceMs });
        }

        this.broadcastWs({
          type: 'chaos_updated',
          chaos: { artificialRttMs, packetLossPercent, jitterVarianceMs },
        });

        this.apiRouter.sendJson(res, 200, {
          success: true,
          chaos: this.mockServer?.getChaos(),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to configure network chaos';
        this.apiRouter.sendJson(res, 500, { error: message });
      }
    });

    this.apiRouter.register('GET /api/network/chaos', (req, res) => {
      this.apiRouter.sendJson(res, 200, {
        chaos: this.mockServer ? this.mockServer.getChaos() : { artificialRttMs: 0, packetLossPercent: 0, jitterVarianceMs: 0 },
      });
    });

    // Turn audio WAV download endpoint
    this.apiRouter.register('GET /api/audio/wav', (req, res) => {
      const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const turnId = parsedUrl.searchParams.get('turnId') || 'turn_1';
      const channel = parsedUrl.searchParams.get('channel') || 'agent';

      let pcmBuffer: Buffer;
      const cached = this.turnAudioMap.get(turnId);
      const chunks = channel === 'caller' ? cached?.caller : cached?.agent;

      if (chunks && chunks.length > 0) {
        pcmBuffer = Buffer.concat(chunks);
      } else {
        pcmBuffer = generateSyntheticUtterance({
          durationMs: 1400,
          sampleRate: 24000,
          vowelSequence: ['a', 'e', 'o', 'i'],
        });
      }

      const wavBytes = createWavBuffer(pcmBuffer, 24000, 1);
      res.writeHead(200, {
        'Content-Type': 'audio/wav',
        'Content-Length': wavBytes.length,
        'Content-Disposition': `attachment; filename="voicelens-${turnId}-${channel}.wav"`,
        'Access-Control-Allow-Origin': '*',
      });
      res.end(wavBytes);
    });
  }

  private broadcastWs(payload: Record<string, unknown>): void {
    const raw = JSON.stringify(payload);
    for (const client of this.connectedWsClients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    }
  }

  private serveStatic(req: IncomingMessage, res: ServerResponse): void {
    const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    let filePath = path.join(this.staticDir, parsedUrl.pathname === '/' ? 'index.html' : parsedUrl.pathname);

    if (!fs.existsSync(filePath)) {
      // Fallback for SPA routing to index.html
      filePath = path.join(this.staticDir, 'index.html');
    }

    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('VoiceLens Web Studio not built yet. Run `npm run build:studio` first.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.wasm': 'application/wasm',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  }

  public async stop(): Promise<void> {
    for (const ws of this.connectedWsClients) {
      ws.close();
    }
    this.connectedWsClients.clear();

    if (this.wss) {
      await new Promise<void>((resolve) => this.wss?.close(() => resolve()));
    }
    if (this.server) {
      await new Promise<void>((resolve) => this.server?.close(() => resolve()));
    }
    if (this.mockServer) {
      await this.mockServer.stop();
    }
    this.server = null;
    this.wss = null;
    this.mockServer = null;
  }
}
