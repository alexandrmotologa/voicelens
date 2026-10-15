import { WebSocket } from 'ws';
import { BaseVoiceProtocol, VoiceProtocolConfig } from './base.js';

export class LiveKitWebRtcProtocol extends BaseVoiceProtocol {
  private ws: WebSocket | null = null;
  private config: VoiceProtocolConfig;
  private connected = false;

  constructor(config: VoiceProtocolConfig) {
    super();
    this.config = {
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

        // Initial media signal
        this.sendJson({
          type: 'join',
          participant: 'voicelens_tester',
          audio: { sampleRate: this.config.sampleRate, channels: 1 },
        });
        resolve();
      });

      this.ws.on('message', (data: Buffer | string) => {
        const now = Date.now();
        if (Buffer.isBuffer(data)) {
          // Direct binary PCM audio packet from room audio track
          this.emit('audio_frame', data, now);
          return;
        }

        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'transcription') {
            this.emit('first_token', msg.text, now);
          } else if (msg.type === 'track_mute' || msg.type === 'agent_interrupted') {
            this.emit('response_cancelled', msg.trackId ?? 'track', now);
          } else if (msg.type === 'audio_payload' && msg.data) {
            const buf = Buffer.from(msg.data, 'base64');
            this.emit('audio_frame', buf, now);
          }
        } catch {
          // Unparsed
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
      throw new Error('LiveKit WebRTC signaling not open');
    }
    // Binary frame over media channel
    this.ws.send(pcmChunk);
  }

  public async commitAudio(): Promise<void> {
    this.sendJson({ type: 'audio_commit' });
  }

  public async triggerResponse(): Promise<void> {
    this.sendJson({ type: 'start_agent' });
  }

  public async cancelResponse(): Promise<void> {
    this.sendJson({ type: 'interrupt_agent' });
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
