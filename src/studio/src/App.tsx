import React, { useState, useEffect, useRef } from 'react';
import { AudioOscilloscope } from './components/AudioOscilloscope.js';
import { LatencyWaterfall, TurnMetricsData } from './components/LatencyWaterfall.js';
import { BargeInTester, BargeInResultData } from './components/BargeInTester.js';
import { MetricStatCards } from './components/MetricStatCards.js';
import { JitterHistogram, JitterBucket } from './components/JitterHistogram.js';

export function App() {
  const [targetEndpoint, setTargetEndpoint] = useState('ws://localhost:50096');
  const [profileName, setProfileName] = useState('enterprise_standard');
  const [apiKey, setApiKey] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Audio level telemetry
  const [callerLevel, setCallerLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);

  // Turn metrics & benchmark summary
  const [turns, setTurns] = useState<TurnMetricsData[]>([]);
  const [overallStatus, setOverallStatus] = useState<'PASS' | 'WARN' | 'FAIL' | 'IDLE'>('IDLE');
  const [summaryStats, setSummaryStats] = useState({
    meanTurnaround: 0,
    p95Turnaround: 0,
    meanTtfa: 0,
    meanTtft: 0,
    meanJitter: 0,
  });

  // Jitter histogram state
  const [jitterBuckets, setJitterBuckets] = useState<JitterBucket[]>([
    { bucketLabel: '0-5ms', count: 18 },
    { bucketLabel: '5-15ms', count: 42 },
    { bucketLabel: '15-30ms', count: 12 },
    { bucketLabel: '30-60ms', count: 3 },
    { bucketLabel: '60-100ms', count: 1 },
    { bucketLabel: '>100ms', count: 0 },
  ]);

  const wsRef = useRef<WebSocket | null>(null);

  // Connect to LocalServer WebSocket for live audio telemetry
  useEffect(() => {
    const wsUrl = `ws://${window.location.host}/ws/live`;
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setWsConnected(true);
      ws.onclose = () => setWsConnected(false);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'audio_level') {
            if (data.channel === 'caller') {
              setCallerLevel(data.level);
            } else if (data.channel === 'agent') {
              setAgentLevel(data.level);
            }
          } else if (data.type === 'turn_result') {
            if (data.turn) {
              setTurns((prev) => [...prev, data.turn]);
            }
          }
        } catch {
          // ignore malformed
        }
      };
    } catch {
      // ignore
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const handleRunBenchmark = async () => {
    setIsRunning(true);
    setTurns([]);
    try {
      const response = await fetch('/api/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEndpoint,
          profileName,
          apiKey: apiKey || undefined,
        }),
      });

      const data = await response.json();
      if (data.success && data.summary) {
        setTurns(data.turns);
        setOverallStatus(data.summary.overallStatus);
        setSummaryStats({
          meanTurnaround: data.summary.turnaroundStats.mean,
          p95Turnaround: data.summary.turnaroundStats.p95,
          meanTtfa: data.summary.ttfaStats.mean,
          meanTtft: data.summary.ttftStats.mean,
          meanJitter: data.summary.jitterStats.mean,
        });
      }
    } catch (err) {
      console.error('Failed to run benchmark:', err);
    } finally {
      setIsRunning(false);
      setCallerLevel(0);
      setAgentLevel(0);
    }
  };

  const handleRunBargeInTest = async (offsetMs: number): Promise<BargeInResultData | null> => {
    setIsRunning(true);
    try {
      const response = await fetch('/api/barge-in/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEndpoint,
          offsetMs,
          profileName,
        }),
      });

      const data = await response.json();
      if (data.success && data.bargeIn) {
        if (data.turn) {
          setTurns((prev) => [data.turn, ...prev]);
        }
        return data.bargeIn;
      }
      return null;
    } catch (err) {
      console.error('Barge-in test error:', err);
      return null;
    } finally {
      setIsRunning(false);
      setCallerLevel(0);
      setAgentLevel(0);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#090d16] text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
            VL
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-extrabold tracking-wider font-mono text-white">
                VOICELENS
              </h1>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800">
                STUDIO v1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Real-Time Voice AI Latency Profiler &amp; Barge-in Harness
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Endpoint */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono">
            <span className="text-slate-500">Target:</span>
            <input
              type="text"
              value={targetEndpoint}
              onChange={(e) => setTargetEndpoint(e.target.value)}
              className="bg-transparent text-slate-200 outline-none w-44"
              placeholder="ws://localhost:50096"
            />
          </div>

          {/* Profile Select */}
          <select
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono outline-none"
          >
            <option value="ultra_fast">Profile: Ultra-Fast (&lt;400ms)</option>
            <option value="enterprise_standard">Profile: Enterprise (500-650ms)</option>
            <option value="congested_telephony">Profile: Congested (&gt;800ms)</option>
          </select>

          {/* Action Button */}
          <button
            onClick={handleRunBenchmark}
            disabled={isRunning}
            className={`px-4 py-1.5 rounded-lg font-mono text-xs font-bold transition-all ${
              isRunning
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-cyan-500 hover:bg-cyan-400 text-black font-semibold shadow-md shadow-cyan-950 cursor-pointer active:scale-95'
            }`}
          >
            {isRunning ? 'PROFILING...' : 'RUN BENCHMARK'}
          </button>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* KPI Stat Cards */}
        <MetricStatCards
          meanTurnaroundMs={summaryStats.meanTurnaround}
          p95TurnaroundMs={summaryStats.p95Turnaround}
          meanTtfaMs={summaryStats.meanTtfa}
          meanTtftMs={summaryStats.meanTtft}
          meanJitterMs={summaryStats.meanJitter}
          overallStatus={overallStatus}
        />

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (8 cols): Oscilloscope & Latency Waterfall */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <AudioOscilloscope
              callerLevel={callerLevel}
              agentLevel={agentLevel}
              isCallerSpeaking={callerLevel > 0.05}
              isAgentSpeaking={agentLevel > 0.05}
            />

            <LatencyWaterfall turns={turns} maxScaleMs={1000} />
          </div>

          {/* Right Column (5 cols): Barge-In Lab & Jitter Histogram */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <BargeInTester onRunTest={handleRunBargeInTest} isRunning={isRunning} />

            <JitterHistogram
              buckets={jitterBuckets}
              sampleCount={76}
              rfcJitterMs={summaryStats.meanJitter || 12.4}
            />

            {/* Conversation Scenarios Card */}
            <div className="glass-panel rounded-xl p-5 flex flex-col gap-3">
              <h3 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
                Active Benchmark Scenarios
              </h3>
              <div className="flex flex-col gap-2 font-mono text-xs">
                <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Turn 1: Account Balance</span>
                    <span className="text-cyan-400">1.4s utterance</span>
                  </div>
                  <p className="text-slate-300">
                    &quot;Hello, can you help me check my current account balance?&quot;
                  </p>
                </div>

                <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800">
                  <div className="flex justify-between text-slate-400 mb-1">
                    <span>Turn 2: Weather Forecast (Barge-in test)</span>
                    <span className="text-rose-400">+400ms interrupt</span>
                  </div>
                  <p className="text-slate-300">
                    &quot;What is the weather forecast for tomorrow morning?&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-3.5 px-6 text-center text-xs font-mono text-slate-500">
        VoiceLens &bull; Real-Time Voice AI Latency Profiler &amp; Barge-in Test Harness &bull; Built with TypeScript &amp; React 19
      </footer>
    </div>
  );
}

export default App;
