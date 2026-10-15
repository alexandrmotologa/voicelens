import { WebSocket } from 'ws';
import { BaseVoiceProtocol, VoiceProtocolConfig } from './base.js';

export class AwsNovaSonicProtocol extends BaseVoiceProtocol {
  private ws: WebSocket | null = null;
  private config: VoiceProtocolConfig;
  private connected = false;

  constructor(config: VoiceProtocolConfig) {
    super();
    this.config = {
      model: 'amazon.nova-sonic-v1:0',
      sampleRate: 24000,
      ...config,
    };
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.config.endpointUrl, {
        headers: this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {},
      });

      this.ws.on('open', () => {
        this.connected = true;
        this.emit('connected');

        // Handshake for AWS Nova Sonic stream
        this.sendJson({
          action: 'startConversation',
          modelId: this.config.model,
          audioFormat: {
            encoding: 'pcm16',
            sampleRate: this.config.sampleRate,
            channels: 1,
          },
        });
        resolve();
      });

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString());
          const now = Date.now();

          if (msg.event === 'textDelta') {
            this.emit('first_token', msg.text, now);
          } else if (msg.event === 'audioDelta' && msg.audio) {
            const buf = Buffer.from(msg.audio, 'base64');
            this.emit('audio_frame', buf, now);
          } else if (msg.event === 'responseComplete') {
            this.emit('response_completed', msg.responseId ?? 'resp', now);
          } else if (msg.event === 'responseCancelled') {
            this.emit('response_cancelled', msg.responseId ?? 'resp', now);
          }
        } catch (e) {
          // Binary audio packet directly
          if (Buffer.isBuffer(data)) {
            this.emit('audio_frame', data, Date.now());
          }
        }
      });

      this.ws.on('close', (code, reason) => {
        this.connected = false;
        this.emit('disconnected', code, reason?.toString());
      });

      this.ws.on('error', (err) => {
        this.emit('error', err);
        if (!this.connected) reject(err);
      });
    });
  }

  public async sendAudioChunk(pcmChunk: Buffer): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('AWS Nova Sonic stream not open');
    }
    this.sendJson({
      action: 'audioInput',
      audio: pcmChunk.toString('base64'),
    });
  }

  public async commitAudio(): Promise<void> {
    this.sendJson({ action: 'endAudioInput' });
  }

  public async triggerResponse(): Promise<void> {
    this.sendJson({ action: 'generateResponse' });
  }

  public async cancelResponse(): Promise<void> {
    this.sendJson({ action: 'interrupt' });
  }

  public isConnected(): boolean {
    return this.connected && this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public async disconnect(): Promise<void> {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
  }

  private sendJson(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }
}
