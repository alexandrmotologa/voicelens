import { WebSocket } from 'ws';
import { BaseVoiceProtocol, VoiceProtocolConfig } from './base.js';

export class OpenAiRealtimeProtocol extends BaseVoiceProtocol {
  private ws: WebSocket | null = null;
  private config: VoiceProtocolConfig;
  private connected = false;
  private currentResponseId: string | null = null;

  constructor(config: VoiceProtocolConfig) {
    super();
    this.config = {
      model: 'gpt-4o-realtime-preview',
      voice: 'alloy',
      sampleRate: 24000,
      ...config,
    };
  }

  public async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = {
        'OpenAI-Beta': 'realtime=v1',
      };
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const url = this.config.endpointUrl.startsWith('ws')
        ? this.config.endpointUrl
        : `wss://api.openai.com/v1/realtime?model=${this.config.model}`;

      this.ws = new WebSocket(url, { headers });

      this.ws.on('open', () => {
        this.connected = true;
        this.emit('connected');

        // Configure session
        this.sendJson({
          type: 'session.update',
          session: {
            modalities: ['audio', 'text'],
            voice: this.config.voice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: null, // manual VAD control for deterministic latency profiling
          },
        });

        resolve();
      });

      this.ws.on('message', (data: Buffer | string) => {
        this.handleMessage(data);
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
      throw new Error('WebSocket is not open');
    }

    this.sendJson({
      type: 'input_audio_buffer.append',
      audio: pcmChunk.toString('base64'),
    });
  }

  public async commitAudio(): Promise<void> {
    this.sendJson({
      type: 'input_audio_buffer.commit',
    });
  }

  public async triggerResponse(): Promise<void> {
    this.sendJson({
      type: 'response.create',
    });
  }

  public async cancelResponse(): Promise<void> {
    this.sendJson({
      type: 'response.cancel',
    });
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

  private handleMessage(data: Buffer | string): void {
    try {
      const msg = JSON.parse(data.toString());
      const now = Date.now();

      switch (msg.type) {
        case 'response.created':
          this.currentResponseId = msg.response?.id ?? 'resp';
          this.emit('response_started', this.currentResponseId, now);
          break;

        case 'response.audio_transcript.delta':
          if (msg.delta) {
            this.emit('first_token', msg.delta, now);
          }
          break;

        case 'response.audio.delta':
          if (msg.delta) {
            const audioBuffer = Buffer.from(msg.delta, 'base64');
            this.emit('audio_frame', audioBuffer, now);
          }
          break;

        case 'input_audio_buffer.speech_started':
          this.emit('speech_started', now);
          break;

        case 'input_audio_buffer.speech_stopped':
          this.emit('speech_stopped', now);
          break;

        case 'response.done':
          this.emit('response_completed', this.currentResponseId ?? '', now);
          break;

        case 'response.cancelled':
          this.emit('response_cancelled', this.currentResponseId ?? '', now);
          break;

        case 'error':
          this.emit('error', new Error(msg.error?.message ?? 'Realtime protocol error'));
          break;
      }
    } catch (err) {
      // Non-json or raw frame
    }
  }
}
