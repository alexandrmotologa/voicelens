import React from 'react';

export interface JitterBucket {
  bucketLabel: string;
  count: number;
}

interface JitterHistogramProps {
  buckets: JitterBucket[];
  sampleCount: number;
  rfcJitterMs: number;
}

export const JitterHistogram: React.FC<JitterHistogramProps> = ({
  buckets,
  sampleCount,
  rfcJitterMs,
}) => {
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  return (
    <div className="glass-panel rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
          Audio Frame Jitter Distribution
        </h3>
        <span className="text-xs font-mono text-cyan-400">
          RFC 3550: {rfcJitterMs.toFixed(1)} ms ({sampleCount} packets)
        </span>
      </div>

      <div className="grid grid-cols-6 gap-2 items-end h-32 pt-4 px-2 bg-slate-900/60 rounded-lg border border-slate-800">
        {buckets.map((b, i) => {
          const heightPct = Math.max(8, (b.count / maxCount) * 100);
          const isHighJitter = i >= 4;

          return (
            <div key={b.bucketLabel} className="flex flex-col items-center gap-1.5 h-full justify-end">
              <span className="text-[10px] font-mono text-slate-400">{b.count}</span>
              <div
                style={{ height: `${heightPct}%` }}
                className={`w-full max-w-[36px] rounded-t transition-all ${
                  isHighJitter
                    ? 'bg-rose-500/80 hover:bg-rose-400'
                    : 'bg-cyan-500/80 hover:bg-cyan-400'
                }`}
                title={`${b.bucketLabel}: ${b.count} packets`}
              />
              <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap">
                {b.bucketLabel}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
