import { EventEmitter } from 'events';

export interface ProtocolEvents {
  connected: () => void;
  disconnected: (code?: number, reason?: string) => void;
  audio_frame: (chunk: Buffer, timestampMs: number) => void;
  first_token: (token: string, timestampMs: number) => void;
  speech_started: (timestampMs: number) => void;
  speech_stopped: (timestampMs: number) => void;
  response_started: (responseId: string, timestampMs: number) => void;
  response_completed: (responseId: string, timestampMs: number) => void;
  response_cancelled: (responseId: string, timestampMs: number) => void;
  error: (err: Error) => void;
}

export interface VoiceProtocolConfig {
  endpointUrl: string;
  apiKey?: string;
  model?: string;
  voice?: string;
  sampleRate?: number;
  temperature?: number;
}

export abstract class BaseVoiceProtocol extends EventEmitter {
  public abstract connect(): Promise<void>;
  public abstract disconnect(): Promise<void>;
  public abstract sendAudioChunk(pcmChunk: Buffer): Promise<void>;
  public abstract commitAudio(): Promise<void>;
  public abstract triggerResponse(): Promise<void>;
  public abstract cancelResponse(): Promise<void>;
  public abstract isConnected(): boolean;
}
