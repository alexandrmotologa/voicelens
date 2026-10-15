import { IncomingMessage, ServerResponse } from 'http';
import { ACOUSTIC_PROFILES } from '../protocols/mock-voice-agent.js';
import { getGoldenUtterances } from '../core/audio/synthetic-voice.js';

export interface RouteHandler {
  (req: IncomingMessage, res: ServerResponse, body?: Record<string, unknown>): Promise<void> | void;
}

export class ApiRouter {
  private routes: Map<string, RouteHandler> = new Map();

  constructor() {
    this.registerDefaults();
  }

  public register(methodPath: string, handler: RouteHandler): void {
    this.routes.set(methodPath, handler);
  }

  public async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const method = req.method ?? 'GET';
    const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const key = `${method} ${pathname}`;

    const handler = this.routes.get(key);
    if (!handler) {
      return false; // Not handled by API router
    }

    if (method === 'POST' || method === 'PUT') {
      let data = '';
      req.on('data', (chunk) => { data += chunk; });
      req.on('end', async () => {
        try {
          const body = data.length > 0 ? JSON.parse(data) : {};
          await handler(req, res, body);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Invalid JSON';
          this.sendJson(res, 400, { error: message });
        }
      });
    } else {
      await handler(req, res);
    }

    return true;
  }

  private registerDefaults(): void {
    this.register('GET /api/status', (req, res) => {
      this.sendJson(res, 200, {
        status: 'online',
        service: 'VoiceLens Studio API',
        version: '1.0.0',
        timestamp: Date.now(),
      });
    });

    this.register('GET /api/profiles', (req, res) => {
      this.sendJson(res, 200, {
        profiles: Object.entries(ACOUSTIC_PROFILES).map(([key, val]) => ({
          id: key,
          ...val,
        })),
      });
    });

    this.register('GET /api/scenarios', (req, res) => {
      const golden = getGoldenUtterances();
      this.sendJson(res, 200, {
        scenarios: golden.map((g) => ({
          id: g.id,
          transcript: g.transcript,
          durationMs: g.durationMs,
        })),
      });
    });
  }

  public sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end(JSON.stringify(data));
  }
}
