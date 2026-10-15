import React from 'react';
import { TurnMetricsData } from './LatencyWaterfall.js';
import { BargeInResultData } from './BargeInTester.js';

interface TurnInspectorModalProps {
  turn: TurnMetricsData | null;
  bargeIn?: BargeInResultData | null;
  onClose: () => void;
}

export function TurnInspectorModal({ turn, bargeIn, onClose }: TurnInspectorModalProps) {
  if (!turn) return null;

  const getStatusColor = (ms: number, target: number, warn: number) => {
    if (ms <= target) return 'text-emerald-400 bg-emerald-950/60 border-emerald-800';
    if (ms <= warn) return 'text-amber-400 bg-amber-950/60 border-amber-800';
    return 'text-rose-400 bg-rose-950/60 border-rose-800';
  };

  const getTurnStatus = (totalMs: number) => {
    if (totalMs <= 600) return { label: 'PASS (SLA MET)', color: 'text-emerald-400 bg-emerald-950/80 border-emerald-800' };
    if (totalMs <= 800) return { label: 'WARN (ACCEPTABLE)', color: 'text-amber-400 bg-amber-950/80 border-amber-800' };
    return { label: 'FAIL (SLA BREACH)', color: 'text-rose-400 bg-rose-950/80 border-rose-800' };
  };

  const status = getTurnStatus(turn.totalTurnaroundMs);

  const vadMs = turn.vadSilenceDelayMs || 0;
  const netMs = turn.networkUplinkMs ?? turn.networkUplinkRttMs ?? 0;
  const llmMs = turn.llmFirstTokenDelayMs ?? (turn.timeToFirstTokenMs ? Math.max(0, turn.timeToFirstTokenMs - vadMs - netMs) : 0);
  const ttsMs = turn.ttsFirstAudioDelayMs ?? (turn.timeToFirstAudioByteMs && turn.timeToFirstTokenMs ? Math.max(0, turn.timeToFirstAudioByteMs - turn.timeToFirstTokenMs) : 0);

  const handleDownloadWav = (channel: 'agent' | 'caller' = 'agent') => {
    const url = `/api/audio/wav?turnId=${encodeURIComponent(turn.turnId)}&channel=${channel}`;
    const a = document.createElement('a');
    a.href = url;
    a.download = `voicelens-${turn.turnId}-${channel}.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050811]/85 p-4">
      <div className="bg-[#0e1422] border border-cyan-500/30 rounded-2xl w-full max-w-2xl shadow-2xl p-4 sm:p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
              🔍
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">Turn Inspector: {turn.turnId}</h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono border font-bold ${status.color}`}>
                  {status.label}
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">Detailed Latency Milestone Decomposition &amp; DSP Audit</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 text-sm font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Total Turnaround Big Card */}
        <div className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl p-4">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">
              Total Conversational Turnaround
            </span>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-3xl font-extrabold font-mono text-cyan-400">
                {turn.totalTurnaroundMs.toFixed(1)}
              </span>
              <span className="text-sm font-mono text-slate-500">ms</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 text-[11px] font-mono text-slate-400">
            <span>Perception Threshold: &lt;650 ms</span>
            <span>Target Budget: 600 ms</span>
          </div>
        </div>

        {/* Milestone Decomposition Breakdown */}
        <div className="flex flex-col gap-2 font-mono text-xs">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
            Milestone Latency Breakdown
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* t_vad */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-400 mb-1">
                <span className="font-semibold text-slate-300">1. Silence VAD Delay (t_vad)</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getStatusColor(vadMs, 250, 350)}`}>
                  {vadMs <= 250 ? 'PASS' : 'WARN'}
                </span>
              </div>
              <span className="text-xl font-bold text-amber-400">{vadMs.toFixed(1)} ms</span>
              <span className="text-[10px] text-slate-500 mt-1">Noise floor hangover &amp; endpointing</span>
            </div>

            {/* t_net */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-400 mb-1">
                <span className="font-semibold text-slate-300">2. Network Uplink RTT (t_net)</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getStatusColor(netMs, 40, 80)}`}>
                  {netMs <= 40 ? 'PASS' : 'WARN'}
                </span>
              </div>
              <span className="text-xl font-bold text-blue-400">{netMs.toFixed(1)} ms</span>
              <span className="text-[10px] text-slate-500 mt-1">WebSocket / WebRTC roundtrip transit</span>
            </div>

            {/* t_ttft */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-400 mb-1">
                <span className="font-semibold text-slate-300">3. First Token TTFT (t_ttft)</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getStatusColor(llmMs, 160, 240)}`}>
                  {llmMs <= 160 ? 'PASS' : 'WARN'}
                </span>
              </div>
              <span className="text-xl font-bold text-purple-400">{llmMs.toFixed(1)} ms</span>
              <span className="text-[10px] text-slate-500 mt-1">LLM reasoning &amp; token streaming</span>
            </div>

            {/* t_ttfa */}
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
              <div className="flex justify-between items-center text-slate-400 mb-1">
                <span className="font-semibold text-slate-300">4. First Audio TTFA (t_ttfa)</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] border ${getStatusColor(ttsMs, 220, 320)}`}>
                  {ttsMs <= 220 ? 'PASS' : 'WARN'}
                </span>
              </div>
              <span className="text-xl font-bold text-emerald-400">{ttsMs.toFixed(1)} ms</span>
              <span className="text-[10px] text-slate-500 mt-1">Neural TTS synthesis &amp; packet dispatch</span>
            </div>
          </div>
        </div>

        {/* Barge-in Interruption Section if present */}
        {bargeIn && (
          <div className="flex flex-col gap-2 font-mono text-xs bg-rose-950/20 border border-rose-900/40 p-3.5 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-300 uppercase tracking-wide">
                Barge-in Interruption Metrics
              </span>
              <span className="text-rose-400 font-bold">
                Cutoff: {(bargeIn.interruptionResponseDelayMs ?? (bargeIn as any).cutoffLatencyMs ?? 0).toFixed(0)} ms
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-slate-400 mt-1">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Injection Offset</span>
                <span className="text-slate-200">+{bargeIn.injectionOffsetMs} ms</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Bleed Duration</span>
                <span className="text-slate-200">{(bargeIn.bleedDurationMs ?? (bargeIn as any).bufferBleedDurationMs ?? 0).toFixed(0)} ms</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block">Bleed Audio</span>
                <span className="text-slate-200">{bargeIn.discardedAudioBytes ?? (bargeIn as any).bufferBleedBytes ?? 0} bytes</span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleDownloadWav('agent')}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-400 font-mono text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5"
            >
              <span>Download Agent Audio (.wav)</span>
            </button>
            <button
              onClick={() => handleDownloadWav('caller')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-300 font-mono text-xs cursor-pointer transition-all"
            >
              <span>Caller Audio (.wav)</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-mono text-xs font-semibold cursor-pointer text-center"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
