import React from 'react';

export interface TurnMetricsData {
  turnId: string;
  userSpeechDurationMs: number;
  vadSilenceDelayMs: number;
  networkUplinkMs: number;
  serverProcessingMs: number;
  timeToFirstTokenMs: number;
  timeToFirstAudioByteMs: number;
  totalTurnaroundMs: number;
  audioPlaybackDurationMs: number;
  jitterMs: number;
  budgetStatus: 'pass' | 'warning' | 'fail';
}

interface LatencyWaterfallProps {
  turns: TurnMetricsData[];
  maxScaleMs?: number;
}

export const LatencyWaterfall: React.FC<LatencyWaterfallProps> = ({
  turns,
  maxScaleMs = 1200,
}) => {
  if (turns.length === 0) {
    return (
      <div className="glass-panel rounded-xl p-6 text-center text-slate-500 font-mono text-sm">
        No conversation turns recorded yet. Launch a benchmark to observe latency segmentation.
      </div>
    );
  }

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
          Acoustic Latency Waterfall Segmentation
        </h3>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-amber-400"></span>
            <span className="text-slate-400">t_vad (Silence)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-sky-400"></span>
            <span className="text-slate-400">t_uplink (Net)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-indigo-500"></span>
            <span className="text-slate-400">t_ttft (LLM)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded bg-emerald-400"></span>
            <span className="text-slate-400">t_ttfa (TTS)</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {turns.map((turn, index) => {
          const totalMs = Math.max(1, turn.totalTurnaroundMs);
          const vadMs = turn.vadSilenceDelayMs;
          const netMs = turn.networkUplinkMs;
          const llmMs = Math.max(0, turn.timeToFirstTokenMs - vadMs - netMs);
          const ttsMs = Math.max(0, turn.timeToFirstAudioByteMs - turn.timeToFirstTokenMs);

          // Percent width relative to scale
          const scale = Math.max(maxScaleMs, totalMs * 1.15);
          const vadPct = (vadMs / scale) * 100;
          const netPct = (netMs / scale) * 100;
          const llmPct = (llmMs / scale) * 100;
          const ttsPct = (ttsMs / scale) * 100;

          return (
            <div key={turn.turnId || index} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-slate-300">
                    Turn #{index + 1}: {turn.turnId}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase ${
                      turn.budgetStatus === 'pass'
                        ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                        : turn.budgetStatus === 'warning'
                        ? 'bg-amber-950/80 text-amber-400 border border-amber-800'
                        : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {turn.budgetStatus} ({totalMs.toFixed(0)} ms)
                  </span>
                </div>
                <div className="text-slate-400 font-mono text-[11px]">
                  Jitter: {turn.jitterMs.toFixed(1)} ms | Playback: {turn.audioPlaybackDurationMs.toFixed(0)} ms
                </div>
              </div>

              {/* Horizontal Stacked Bar */}
              <div className="relative w-full h-8 bg-slate-900 rounded-lg overflow-hidden flex border border-slate-800/80">
                {/* VAD Silence */}
                <div
                  style={{ width: `${vadPct}%` }}
                  className="h-full bg-amber-400/90 flex items-center justify-center text-[10px] font-mono font-bold text-slate-950 overflow-hidden whitespace-nowrap px-1"
                  title={`VAD Silence Confirmation: ${vadMs.toFixed(0)}ms`}
                >
                  {vadMs > 40 ? `${vadMs.toFixed(0)}ms` : ''}
                </div>

                {/* Network Uplink */}
                <div
                  style={{ width: `${Math.max(1, netPct)}%` }}
                  className="h-full bg-sky-400/90 flex items-center justify-center text-[10px] font-mono font-bold text-slate-950 overflow-hidden whitespace-nowrap px-1"
                  title={`Network Uplink: ${netMs.toFixed(0)}ms`}
                >
                  {netMs > 30 ? `${netMs.toFixed(0)}ms` : ''}
                </div>

                {/* LLM TTFT */}
                <div
                  style={{ width: `${llmPct}%` }}
                  className="h-full bg-indigo-500/90 flex items-center justify-center text-[10px] font-mono font-bold text-white overflow-hidden whitespace-nowrap px-1"
                  title={`LLM Thinking (TTFT): ${llmMs.toFixed(0)}ms`}
                >
                  {llmMs > 40 ? `${llmMs.toFixed(0)}ms` : ''}
                </div>

                {/* TTS TTFA */}
                <div
                  style={{ width: `${ttsPct}%` }}
                  className="h-full bg-emerald-400/90 flex items-center justify-center text-[10px] font-mono font-bold text-slate-950 overflow-hidden whitespace-nowrap px-1"
                  title={`TTS Audio Byte Delivery: ${ttsMs.toFixed(0)}ms`}
                >
                  {ttsMs > 40 ? `${ttsMs.toFixed(0)}ms` : ''}
                </div>
              </div>

              {/* Scale Marker */}
              <div className="flex justify-between text-[10px] font-mono text-slate-600 px-1">
                <span>0 ms (Speech End)</span>
                <span>300 ms (VAD Threshold)</span>
                <span>600 ms (Human Perception SLA)</span>
                <span>800 ms (Awkward Delay Limit)</span>
                <span>{scale.toFixed(0)} ms</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
