import React from 'react';

interface MetricStatCardsProps {
  meanTurnaroundMs: number;
  p95TurnaroundMs: number;
  meanTtfaMs: number;
  meanTtftMs: number;
  meanJitterMs: number;
  overallStatus: 'PASS' | 'WARN' | 'FAIL' | 'IDLE';
}

export const MetricStatCards: React.FC<MetricStatCardsProps> = ({
  meanTurnaroundMs,
  p95TurnaroundMs,
  meanTtfaMs,
  meanTtftMs,
  meanJitterMs,
  overallStatus,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
      {/* 1. Turnaround */}
      <div className="glass-panel rounded-xl p-4 flex flex-col gap-1 border-t-2 border-t-cyan-500">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          Turnaround (Mean)
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-mono font-extrabold text-cyan-400">
            {meanTurnaroundMs > 0 ? meanTurnaroundMs.toFixed(0) : '--'}
          </span>
          <span className="text-xs font-mono text-slate-500">ms</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          P95: {p95TurnaroundMs > 0 ? `${p95TurnaroundMs.toFixed(0)} ms` : '--'}
        </span>
      </div>

      {/* 2. TTFA */}
      <div className="glass-panel rounded-xl p-4 flex flex-col gap-1 border-t-2 border-t-emerald-500">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          TTFA (First Audio)
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-mono font-extrabold text-emerald-400">
            {meanTtfaMs > 0 ? meanTtfaMs.toFixed(0) : '--'}
          </span>
          <span className="text-xs font-mono text-slate-500">ms</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          TTS Chunk Streaming
        </span>
      </div>

      {/* 3. TTFT */}
      <div className="glass-panel rounded-xl p-4 flex flex-col gap-1 border-t-2 border-t-indigo-500">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          TTFT (First Token)
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-mono font-extrabold text-indigo-400">
            {meanTtftMs > 0 ? meanTtftMs.toFixed(0) : '--'}
          </span>
          <span className="text-xs font-mono text-slate-500">ms</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          ASR + Model Reasoning
        </span>
      </div>

      {/* 4. Jitter */}
      <div className="glass-panel rounded-xl p-4 flex flex-col gap-1 border-t-2 border-t-amber-500">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          Packet Jitter
        </span>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-mono font-extrabold text-amber-400">
            {meanJitterMs > 0 ? meanJitterMs.toFixed(1) : '--'}
          </span>
          <span className="text-xs font-mono text-slate-500">ms</span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          RFC 3550 Interarrival
        </span>
      </div>

      {/* 5. SLA Status */}
      <div className="glass-panel rounded-xl p-4 flex flex-col gap-1 border-t-2 border-t-purple-500 col-span-1 sm:col-span-2 lg:col-span-1">
        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
          SLA Compliance
        </span>
        <div className="flex items-baseline gap-1.5">
          <span
            className={`text-xl font-mono font-extrabold ${
              overallStatus === 'PASS'
                ? 'text-emerald-400'
                : overallStatus === 'WARN'
                ? 'text-amber-400'
                : overallStatus === 'FAIL'
                ? 'text-rose-400'
                : 'text-slate-500'
            }`}
          >
            {overallStatus}
          </span>
        </div>
        <span className="text-[10px] font-mono text-slate-500">
          Target: &lt;600ms turnaround
        </span>
      </div>
    </div>
  );
};
