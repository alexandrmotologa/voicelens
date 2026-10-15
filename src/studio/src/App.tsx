import React, { useState, useEffect, useRef } from 'react';
import { AudioOscilloscope } from './components/AudioOscilloscope.js';
import { LatencyWaterfall, TurnMetricsData } from './components/LatencyWaterfall.js';
import { BargeInTester, BargeInResultData } from './components/BargeInTester.js';
import { MetricStatCards } from './components/MetricStatCards.js';
import { JitterHistogram, JitterBucket } from './components/JitterHistogram.js';
import { NetworkChaosPanel, ChaosSettings } from './components/NetworkChaosPanel.js';
import { ScenarioBuilderModal, StudioScenario } from './components/ScenarioBuilderModal.js';
import { TurnInspectorModal } from './components/TurnInspectorModal.js';
import { PcmPlayer } from './audio/pcm-player.js';
import { MicCapture } from './audio/mic-capture.js';
import { generateMarkdownReport, downloadFile } from './utils/report-exporter.js';

export function App() {
  const [targetEndpoint, setTargetEndpoint] = useState('ws://localhost:50096');
  const [profileName, setProfileName] = useState('enterprise_standard');
  const [apiKey, setApiKey] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);

  // Audio telemetry & hardware states
  const [callerLevel, setCallerLevel] = useState(0);
  const [agentLevel, setAgentLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isMicActive, setIsMicActive] = useState(false);

  // Turn metrics & benchmark summary
  const [turns, setTurns] = useState<TurnMetricsData[]>([]);
  const [overallStatus, setOverallStatus] = useState<'PASS' | 'WARN' | 'FAIL' | 'IDLE'>('IDLE');
  const [latestBargeIn, setLatestBargeIn] = useState<BargeInResultData | null>(null);
  const [summaryStats, setSummaryStats] = useState({
    meanTurnaround: 0,
    p95Turnaround: 0,
    meanTtfa: 0,
    meanTtft: 0,
    meanJitter: 0,
  });

  // Jitter histogram state
  const [jitterBuckets, setJitterBuckets] = useState<JitterBucket[]>([
    { bucketLabel: '0-5ms', count: 0 },
    { bucketLabel: '5-15ms', count: 0 },
    { bucketLabel: '15-30ms', count: 0 },
    { bucketLabel: '30-60ms', count: 0 },
    { bucketLabel: '60-100ms', count: 0 },
    { bucketLabel: '>100ms', count: 0 },
  ]);

  // Modal and drawer states
  const [isChaosOpen, setIsChaosOpen] = useState(false);
  const [isScenarioBuilderOpen, setIsScenarioBuilderOpen] = useState(false);
  const [selectedTurn, setSelectedTurn] = useState<TurnMetricsData | null>(null);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  // Network chaos settings
  const [chaosSettings, setChaosSettings] = useState<ChaosSettings>({
    artificialRttMs: 0,
    packetLossPercent: 0,
    jitterVarianceMs: 0,
  });

  // Multi-turn scenarios
  const [scenarios, setScenarios] = useState<StudioScenario[]>([
    {
      id: 'turn_1',
      transcript: 'Hello, can you help me check my current account balance?',
      durationMs: 1400,
      testBargeIn: false,
      bargeInOffsetMs: 400,
    },
    {
      id: 'turn_2',
      transcript: 'What is the weather forecast for tomorrow morning?',
      durationMs: 1500,
      testBargeIn: true,
      bargeInOffsetMs: 400,
    },
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const pcmPlayerRef = useRef<PcmPlayer | null>(null);
  const micCaptureRef = useRef<MicCapture | null>(null);

  // Initialize Web Audio PCM Player
  useEffect(() => {
    pcmPlayerRef.current = new PcmPlayer(24000);
    return () => {
      pcmPlayerRef.current?.close();
    };
  }, []);

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
              if (data.chunkBase64 && pcmPlayerRef.current && !isMuted) {
                pcmPlayerRef.current.playChunk(data.chunkBase64);
              }
            }
          } else if (data.type === 'audio_stop') {
            pcmPlayerRef.current?.stop();
            setAgentLevel(0);
          } else if (data.type === 'turn_result') {
            if (data.turn) {
              setTurns((prev) => [...prev, data.turn]);
              if (data.bargeIn) {
                setLatestBargeIn(data.bargeIn);
              }
            }
          } else if (data.type === 'chaos_updated' && data.chaos) {
            setChaosSettings(data.chaos);
          }
        } catch {
          // ignore malformed message
        }
      };
    } catch {
      // ignore connection failures
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [isMuted]);

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
          scenarios,
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
        if (data.summary.jitterHistogram) {
          setJitterBuckets(data.summary.jitterHistogram);
        }
        if (data.bargeIns && data.bargeIns.length > 0) {
          setLatestBargeIn(data.bargeIns[0]);
        }
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
        setLatestBargeIn(data.bargeIn);
        if (data.turn) {
          setTurns((prev) => [data.turn, ...prev]);
          if (data.turn.jitterReport?.histogram) {
            setJitterBuckets(data.turn.jitterReport.histogram);
          }
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

  const toggleLiveMic = async () => {
    if (isMicActive) {
      micCaptureRef.current?.stop();
      setIsMicActive(false);
      setCallerLevel(0);
    } else {
      try {
        const mic = new MicCapture({
          sampleRate: 24000,
          onChunk: (base64Chunk, rms) => {
            setCallerLevel(rms);
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'mic_chunk',
                  chunkBase64: base64Chunk,
                })
              );
            }
          },
          onError: (err) => {
            console.error('Mic error:', err);
            setIsMicActive(false);
            setCallerLevel(0);
          },
        });
        await mic.start();
        micCaptureRef.current = mic;
        setIsMicActive(true);
      } catch (err) {
        console.error('Failed to activate microphone:', err);
        alert('Could not access microphone: ' + (err instanceof Error ? err.message : String(err)));
        setIsMicActive(false);
      }
    }
  };

  const toggleSpeakerMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    pcmPlayerRef.current?.setMute(next);
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdownReport(
      { ...summaryStats, overallStatus },
      turns,
      latestBargeIn ? [latestBargeIn] : [],
      profileName,
      targetEndpoint
    );
    const filename = `voicelens-audit-report-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.md`;
    downloadFile(md, filename, 'text/markdown');
    setIsExportMenuOpen(false);
  };

  const handleExportJson = () => {
    const payload = {
      timestamp: new Date().toISOString(),
      targetEndpoint,
      profileName,
      overallStatus,
      summaryStats,
      turns,
      bargeIns: latestBargeIn ? [latestBargeIn] : [],
      chaosSettings,
      scenarios,
    };
    const json = JSON.stringify(payload, null, 2);
    const filename = `voicelens-telemetry-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    downloadFile(json, filename, 'application/json');
    setIsExportMenuOpen(false);
  };

  const isDegraded =
    chaosSettings.artificialRttMs > 0 ||
    chaosSettings.packetLossPercent > 0 ||
    chaosSettings.jitterVarianceMs > 0;

  return (
    <div className="flex flex-col min-h-screen bg-[#090d16] text-slate-100">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#090d16]/90 backdrop-blur sticky top-0 z-40 px-6 py-3 flex flex-col xl:flex-row items-center justify-between gap-4">
        {/* Brand */}
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
                STUDIO v1.1
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Real-Time Voice AI Latency Profiler &amp; Barge-in Harness
            </p>
          </div>
        </div>

        {/* Global Controls & Tools */}
        <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto justify-end">
          {/* Target Endpoint Input */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs font-mono">
            <span className="text-slate-500">Target:</span>
            <input
              type="text"
              value={targetEndpoint}
              onChange={(e) => setTargetEndpoint(e.target.value)}
              className="bg-transparent text-slate-200 outline-none w-40"
              placeholder="ws://localhost:50096"
            />
          </div>

          {/* Profile Select */}
          <select
            value={profileName}
            onChange={(e) => setProfileName(e.target.value)}
            className="bg-slate-900 border border-slate-800 text-slate-200 rounded-lg px-2.5 py-1 text-xs font-mono outline-none cursor-pointer"
          >
            <option value="ultra_fast">Ultra-Fast (&lt;400ms)</option>
            <option value="enterprise_standard">Enterprise (500-650ms)</option>
            <option value="congested_telephony">Congested (&gt;800ms)</option>
          </select>

          {/* Speaker Audio Mute Toggle */}
          <button
            onClick={toggleSpeakerMute}
            className={`px-2.5 py-1 rounded-lg font-mono text-xs border transition-all cursor-pointer flex items-center gap-1.5 ${
              isMuted
                ? 'bg-rose-950/40 border-rose-800 text-rose-400'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title={isMuted ? 'Speaker Muted - Click to Unmute' : 'Audible Speaker Active - Click to Mute'}
          >
            <span>{isMuted ? '🔇' : '🔊'}</span>
            <span>{isMuted ? 'Muted' : 'Audio ON'}</span>
          </button>

          {/* Live Mic Toggle */}
          <button
            onClick={toggleLiveMic}
            className={`px-2.5 py-1 rounded-lg font-mono text-xs border transition-all cursor-pointer flex items-center gap-1.5 ${
              isMicActive
                ? 'bg-rose-900/40 border-rose-600 text-rose-300 animate-pulse'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Ingest microphone audio directly in browser"
          >
            <span className={`w-2 h-2 rounded-full ${isMicActive ? 'bg-rose-500' : 'bg-slate-500'}`} />
            <span>{isMicActive ? 'Mic Active' : 'Live Mic'}</span>
          </button>

          {/* Network Chaos Toggle */}
          <button
            onClick={() => setIsChaosOpen(true)}
            className={`px-2.5 py-1 rounded-lg font-mono text-xs border transition-all cursor-pointer flex items-center gap-1.5 ${
              isDegraded
                ? 'bg-amber-950/50 border-amber-500/60 text-amber-300'
                : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white'
            }`}
            title="Configure artificial latency, jitter, and packet loss"
          >
            <span>⚡</span>
            <span>{isDegraded ? `Chaos (+${chaosSettings.artificialRttMs}ms)` : 'Chaos Lab'}</span>
          </button>

          {/* Scenarios Button */}
          <button
            onClick={() => setIsScenarioBuilderOpen(true)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-300 rounded-lg font-mono text-xs cursor-pointer transition-all flex items-center gap-1.5"
            title="Design custom multi-turn dialogue scenarios"
          >
            <span>📝</span>
            <span>Scenarios ({scenarios.length})</span>
          </button>

          {/* Export Report Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
              className="px-3 py-1 bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white rounded-lg font-mono text-xs cursor-pointer flex items-center gap-1"
            >
              <span>Export</span>
              <span className="text-[10px]">▼</span>
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-48 bg-[#0e1422] border border-slate-800 rounded-xl shadow-2xl py-1 z-50 font-mono text-xs flex flex-col">
                <button
                  onClick={handleExportMarkdown}
                  className="px-3 py-2 text-left hover:bg-slate-800/80 text-slate-300 hover:text-cyan-300 cursor-pointer transition-colors"
                >
                  📄 Audit Report (.md)
                </button>
                <button
                  onClick={handleExportJson}
                  className="px-3 py-2 text-left hover:bg-slate-800/80 text-slate-300 hover:text-cyan-300 cursor-pointer transition-colors border-t border-slate-800/60"
                >
                  📊 Raw Telemetry (.json)
                </button>
              </div>
            )}
          </div>

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
          {/* Left Column (7 cols): Oscilloscope & Latency Waterfall */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <AudioOscilloscope
              callerLevel={callerLevel}
              agentLevel={agentLevel}
              isCallerSpeaking={callerLevel > 0.05}
              isAgentSpeaking={agentLevel > 0.05}
            />

            <LatencyWaterfall
              turns={turns}
              maxScaleMs={1000}
              onSelectTurn={(turn) => setSelectedTurn(turn)}
            />
          </div>

          {/* Right Column (5 cols): Barge-In Lab & Jitter Histogram */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <BargeInTester onRunTest={handleRunBargeInTest} isRunning={isRunning} />

            <JitterHistogram
              buckets={jitterBuckets}
              sampleCount={turns.reduce((acc, t) => acc + (t.audioPacketCount ?? 0), 0)}
              rfcJitterMs={summaryStats.meanJitter}
            />

            {/* Conversation Scenarios Card */}
            <div className="glass-panel rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold tracking-wide text-slate-200 uppercase">
                  Active Benchmark Scenarios ({scenarios.length})
                </h3>
                <button
                  onClick={() => setIsScenarioBuilderOpen(true)}
                  className="text-xs font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                >
                  Edit Scenarios 📝
                </button>
              </div>

              <div className="flex flex-col gap-2 font-mono text-xs">
                {scenarios.map((s, idx) => (
                  <div
                    key={s.id || idx}
                    className="p-2.5 rounded bg-slate-900/60 border border-slate-800 flex flex-col gap-1"
                  >
                    <div className="flex justify-between text-slate-400">
                      <span className="font-semibold text-slate-300">
                        Turn {idx + 1}: {s.id}
                      </span>
                      {s.testBargeIn ? (
                        <span className="text-rose-400 font-bold">
                          +{s.bargeInOffsetMs}ms interrupt
                        </span>
                      ) : (
                        <span className="text-cyan-400 font-bold">
                          {(s.durationMs / 1000).toFixed(1)}s utterance
                        </span>
                      )}
                    </div>
                    <p className="text-slate-300 text-[11px] italic">
                      &quot;{s.transcript}&quot;
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 py-3.5 px-6 text-center text-xs font-mono text-slate-500">
        VoiceLens &bull; Real-Time Voice AI Latency Profiler &amp; Barge-in Test Harness &bull; Built with TypeScript &amp; React 19
      </footer>

      {/* Modals and Overlays */}
      <NetworkChaosPanel
        isOpen={isChaosOpen}
        onClose={() => setIsChaosOpen(false)}
        onChaosChange={(settings) => setChaosSettings(settings)}
      />

      <ScenarioBuilderModal
        isOpen={isScenarioBuilderOpen}
        onClose={() => setIsScenarioBuilderOpen(false)}
        scenarios={scenarios}
        onSave={(updated) => setScenarios(updated)}
      />

      <TurnInspectorModal
        turn={selectedTurn}
        bargeIn={latestBargeIn}
        onClose={() => setSelectedTurn(null)}
      />
    </div>
  );
}

export default App;
