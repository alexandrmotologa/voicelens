import React, { useState, useEffect } from 'react';

export interface ChaosSettings {
  artificialRttMs: number;
  packetLossPercent: number;
  jitterVarianceMs: number;
}

interface NetworkChaosPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onChaosChange?: (settings: ChaosSettings) => void;
}

export function NetworkChaosPanel({ isOpen, onClose, onChaosChange }: NetworkChaosPanelProps) {
  const [settings, setSettings] = useState<ChaosSettings>({
    artificialRttMs: 0,
    packetLossPercent: 0,
    jitterVarianceMs: 0,
  });

  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    // Fetch initial chaos state from server
    fetch('/api/network/chaos')
      .then((r) => r.json())
      .then((data) => {
        if (data.chaos) {
          setSettings(data.chaos);
        }
      })
      .catch(() => {});
  }, []);

  const applyChaos = async (newSettings: ChaosSettings) => {
    setSettings(newSettings);
    setIsApplying(true);
    try {
      await fetch('/api/network/chaos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (onChaosChange) {
        onChaosChange(newSettings);
      }
    } catch (err) {
      console.error('Failed to update chaos settings:', err);
    } finally {
      setIsApplying(false);
    }
  };

  const handlePreset = (preset: 'clean' | 'mobile' | 'congested' | 'satellite') => {
    switch (preset) {
      case 'clean':
        applyChaos({ artificialRttMs: 0, packetLossPercent: 0, jitterVarianceMs: 0 });
        break;
      case 'mobile':
        applyChaos({ artificialRttMs: 60, packetLossPercent: 2, jitterVarianceMs: 8 });
        break;
      case 'congested':
        applyChaos({ artificialRttMs: 180, packetLossPercent: 6, jitterVarianceMs: 25 });
        break;
      case 'satellite':
        applyChaos({ artificialRttMs: 240, packetLossPercent: 3, jitterVarianceMs: 18 });
        break;
    }
  };

  if (!isOpen) return null;

  const isDegraded = settings.artificialRttMs > 0 || settings.packetLossPercent > 0 || settings.jitterVarianceMs > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050811]/85 p-4">
      <div className="bg-[#0e1422] border border-amber-500/30 rounded-2xl w-full max-w-lg shadow-2xl p-4 sm:p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-bold">
              ⚡
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Network Chaos Simulator</h2>
              <p className="text-xs text-slate-400 font-mono">Inject realistic packet loss, RTT, and jitter variance</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 text-sm font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Quick Presets */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold">
            Network Presets
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
            <button
              onClick={() => handlePreset('clean')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-600 text-slate-300 hover:text-white transition-all text-center cursor-pointer"
            >
              Clean Fiber
            </button>
            <button
              onClick={() => handlePreset('mobile')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-amber-500/40 text-slate-300 hover:text-amber-300 transition-all text-center cursor-pointer"
            >
              4G Mobile
            </button>
            <button
              onClick={() => handlePreset('congested')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-300 transition-all text-center cursor-pointer"
            >
              Congested 3G
            </button>
            <button
              onClick={() => handlePreset('satellite')}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-purple-300 transition-all text-center cursor-pointer"
            >
              Satellite
            </button>
          </div>
        </div>

        {/* Parameter Sliders */}
        <div className="flex flex-col gap-4 font-mono text-xs">
          {/* Artificial RTT */}
          <div className="flex flex-col gap-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Artificial RTT Delay:</span>
              <span className="text-amber-400 font-bold">+{settings.artificialRttMs} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="500"
              step="10"
              value={settings.artificialRttMs}
              onChange={(e) => applyChaos({ ...settings, artificialRttMs: Number(e.target.value) })}
              className="w-full accent-amber-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0 ms (Localhost)</span>
              <span>250 ms</span>
              <span>500 ms (Worst-case)</span>
            </div>
          </div>

          {/* Packet Loss */}
          <div className="flex flex-col gap-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Simulated Packet Loss:</span>
              <span className="text-rose-400 font-bold">{settings.packetLossPercent}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="20"
              step="1"
              value={settings.packetLossPercent}
              onChange={(e) => applyChaos({ ...settings, packetLossPercent: Number(e.target.value) })}
              className="w-full accent-rose-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0% (Ideal)</span>
              <span>10% (High Loss)</span>
              <span>20% (Cellular Drop)</span>
            </div>
          </div>

          {/* Jitter Variance */}
          <div className="flex flex-col gap-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between items-center">
              <span className="text-slate-300 font-semibold">Packet Arrival Jitter:</span>
              <span className="text-cyan-400 font-bold">&plusmn;{settings.jitterVarianceMs} ms</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              step="2"
              value={settings.jitterVarianceMs}
              onChange={(e) => applyChaos({ ...settings, jitterVarianceMs: Number(e.target.value) })}
              className="w-full accent-cyan-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0 ms</span>
              <span>20 ms (Noticeable)</span>
              <span>40 ms (Severe)</span>
            </div>
          </div>
        </div>

        {/* Status Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                isDegraded ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
              }`}
            />
            <span className="text-xs font-mono text-slate-400">
              {isDegraded ? 'Degraded Network Active' : 'Normal Conditions (Clean)'}
            </span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-mono text-xs font-semibold cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
