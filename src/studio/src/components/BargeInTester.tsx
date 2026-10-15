import React, { useState } from 'react';

export interface BargeInResultData {
  injectionOffsetMs: number;
  interruptionInitiatedAtMs: number;
  agentAudioHaltedAtMs: number;
  interruptionResponseDelayMs: number;
  discardedAudioFramesCount: number;
  discardedAudioBytes: number;
  bleedDurationMs: number;
  cleanCutoff: boolean;
  slaTargetMs: number;
  passedSla: boolean;
}

interface BargeInTesterProps {
  onRunTest: (offsetMs: number) => Promise<BargeInResultData | null>;
  isRunning: boolean;
}

export const BargeInTester: React.FC<BargeInTesterProps> = ({ onRunTest, isRunning }) => {
  const [offsetMs, setOffsetMs] = useState(400);
  const [results, setResults] = useState<BargeInResultData[]>([]);
  const [latestResult, setLatestResult] = useState<BargeInResultData | null>(null);

  const handleTrigger = async () => {
    const res = await onRunTest(offsetMs);
    if (res) {
      setLatestResult(res);
      setResults((prev) => [res, ...prev.slice(0, 4)]);
    }
  };

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping"></span>
          <h3 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
            Barge-In Interruption Test Lab
          </h3>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Target SLA: &lt; 180 ms cutoff
        </span>
      </div>

      <div className="flex flex-col sm:flex-row items-center gap-4 bg-slate-900/60 p-4 rounded-lg border border-slate-800">
        <div className="flex-1 w-full">
          <div className="flex justify-between text-xs font-mono mb-1.5">
            <span className="text-slate-400">Speech Offset:</span>
            <span className="text-cyan-400 font-bold">+{offsetMs} ms into agent stream</span>
          </div>
          <input
            type="range"
            min="100"
            max="1200"
            step="50"
            value={offsetMs}
            onChange={(e) => setOffsetMs(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer"
            disabled={isRunning}
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
            <span>+100ms (Immediate)</span>
            <span>+400ms (Mid-sentence)</span>
            <span>+1200ms (Late)</span>
          </div>
        </div>

        <button
          onClick={handleTrigger}
          disabled={isRunning}
          className={`px-5 py-2.5 rounded-lg font-mono text-xs font-bold tracking-wide transition-all shadow-lg ${
            isRunning
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
              : 'bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-white shadow-rose-950/50 cursor-pointer active:scale-95'
          }`}
        >
          {isRunning ? 'Interrupting...' : 'TRIGGER INTERRUPT'}
        </button>
      </div>

      {latestResult && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-950/80 p-3.5 rounded-lg border border-slate-800/80">
          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-500">Cutoff Latency</span>
            <span
              className={`text-lg font-mono font-bold ${
                latestResult.passedSla ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {latestResult.interruptionResponseDelayMs.toFixed(0)} ms
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-500">Cutoff Quality</span>
            <span
              className={`text-xs font-mono font-bold mt-1 ${
                latestResult.cleanCutoff ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              {latestResult.cleanCutoff ? 'CLEAN HALT' : 'BUFFER BLEED'}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-500">Discarded Frames</span>
            <span className="text-lg font-mono font-bold text-slate-200">
              {latestResult.discardedAudioFramesCount}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[10px] font-mono uppercase text-slate-500">Bleed Window</span>
            <span className="text-lg font-mono font-bold text-slate-300">
              {latestResult.bleedDurationMs.toFixed(0)} ms
            </span>
          </div>
        </div>
      )}

      {results.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-mono uppercase text-slate-400">Recent Interruption Sweeps</span>
          <div className="flex flex-col gap-1">
            {results.slice(1).map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-1.5 px-3 bg-slate-900/40 rounded border border-slate-800 text-xs font-mono"
              >
                <span className="text-slate-400">Offset +{r.injectionOffsetMs}ms</span>
                <span className={r.passedSla ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {r.interruptionResponseDelayMs.toFixed(0)} ms ({r.cleanCutoff ? 'Clean' : 'Bleed'})
                </span>
                <span className="text-slate-500 text-[10px]">{r.discardedAudioFramesCount} dropped</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
