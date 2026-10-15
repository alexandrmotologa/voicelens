import React, { useEffect, useRef } from 'react';

interface AudioOscilloscopeProps {
  callerLevel: number; // 0.0 to 1.0
  agentLevel: number;  // 0.0 to 1.0
  isCallerSpeaking: boolean;
  isAgentSpeaking: boolean;
}

export const AudioOscilloscope: React.FC<AudioOscilloscopeProps> = ({
  callerLevel,
  agentLevel,
  isCallerSpeaking,
  isAgentSpeaking,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    // Ring buffers for waveform history
    const historyLength = 120;
    const callerHistory = new Float32Array(historyLength);
    const agentHistory = new Float32Array(historyLength);

    const render = () => {
      phase += 0.08;

      // Shift history buffers
      for (let i = 0; i < historyLength - 1; i++) {
        callerHistory[i] = callerHistory[i + 1];
        agentHistory[i] = agentHistory[i + 1];
      }
      callerHistory[historyLength - 1] = callerLevel;
      agentHistory[historyLength - 1] = agentLevel;

      const width = canvas.width;
      const height = canvas.height;

      // Clear with dark slate backdrop
      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, width, height);

      // Grid lines
      ctx.strokeStyle = 'rgba(51, 65, 85, 0.25)';
      ctx.lineWidth = 1;

      // Horizontal center & quarter lines
      const midY = height / 2;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.25);
      ctx.lineTo(width, height * 0.25);
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.moveTo(0, height * 0.75);
      ctx.lineTo(width, height * 0.75);
      ctx.stroke();

      // Vertical time grid markers
      for (let x = 0; x < width; x += 60) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // Draw Caller Waveform (Upper Half: Cyan)
      const callerYCenter = height * 0.25;
      ctx.beginPath();
      ctx.strokeStyle = '#00f5ff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur = isCallerSpeaking ? 12 : 2;

      for (let i = 0; i < historyLength; i++) {
        const x = (i / (historyLength - 1)) * width;
        const amp = callerHistory[i] * 45;
        const wiggle = Math.sin(phase + i * 0.25) * amp;
        const y = callerYCenter + wiggle;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Draw Agent Waveform (Lower Half: Violet)
      const agentYCenter = height * 0.75;
      ctx.beginPath();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = isAgentSpeaking ? 14 : 2;

      for (let i = 0; i < historyLength; i++) {
        const x = (i / (historyLength - 1)) * width;
        const amp = agentHistory[i] * 45;
        const wiggle = Math.sin(phase * 1.2 + i * 0.3) * amp;
        const y = agentYCenter + wiggle;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0; // Reset shadow

      // Center separator beam
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();
      ctx.setLineDash([]);

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [callerLevel, agentLevel, isCallerSpeaking, isAgentSpeaking]);

  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse"></span>
          <h3 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
            Full-Duplex Dual-Channel Oscilloscope
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
            <span className="text-slate-400">Uplink (User):</span>
            <span className={isCallerSpeaking ? 'text-cyan-400 font-bold' : 'text-slate-500'}>
              {isCallerSpeaking ? 'VOICED' : 'SILENCE'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-400"></span>
            <span className="text-slate-400">Downlink (Agent):</span>
            <span className={isAgentSpeaking ? 'text-purple-400 font-bold' : 'text-slate-500'}>
              {isAgentSpeaking ? 'STREAMING' : 'IDLE'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative w-full aspect-[21/9] max-h-72 rounded-lg overflow-hidden border border-slate-800 bg-[#0b1120]">
        <canvas
          ref={canvasRef}
          width={840}
          height={320}
          className="w-full h-full block"
        />

        {/* Channel Labels Overlay */}
        <div className="absolute top-3 left-4 text-[11px] font-mono tracking-wider text-cyan-400/80 uppercase pointer-events-none">
          CH 1: Caller Uplink (PCM 24kHz)
        </div>
        <div className="absolute bottom-3 left-4 text-[11px] font-mono tracking-wider text-purple-400/80 uppercase pointer-events-none">
          CH 2: Agent Response (Realtime TTS)
        </div>
      </div>
    </div>
  );
};
