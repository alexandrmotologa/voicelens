import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ApiRouter } from './api-router.js';
import { MockVoiceAgentServer } from '../protocols/mock-voice-agent.js';
import { OpenAiRealtimeProtocol } from '../protocols/openai-realtime.js';
import { BenchmarkSuite } from '../core/runner/benchmark-suite.js';
import { calculateRms } from '../core/audio/pcm-buffer.js';

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

        const suite = new BenchmarkSuite({ protocol });

        // Forward real-time events to connected Studio UI clients
        suite.on('caller_frame', (data) => {
          const rms = calculateRms(data.chunk);
          this.broadcastWs({
            type: 'audio_level',
            channel: 'caller',
            level: rms,
            timestampMs: data.timestampMs,
          });
        });

        suite.on('audio_frame', (data) => {
          const rms = calculateRms(data.chunk);
          this.broadcastWs({
            type: 'audio_level',
            channel: 'agent',
            level: rms,
            timestampMs: data.timestampMs,
          });
        });

        suite.on('turn_end', (data) => {
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
