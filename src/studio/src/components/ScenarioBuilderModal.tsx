import React, { useState } from 'react';

export interface StudioScenario {
  id: string;
  transcript: string;
  durationMs: number;
  testBargeIn: boolean;
  bargeInOffsetMs: number;
}

interface ScenarioBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  scenarios: StudioScenario[];
  onSave: (scenarios: StudioScenario[]) => void;
}

const TEMPLATES: Record<string, StudioScenario[]> = {
  banking: [
    {
      id: 'turn_1',
      transcript: 'Hello, can you help me check my current account balance?',
      durationMs: 1400,
      testBargeIn: false,
      bargeInOffsetMs: 400,
    },
    {
      id: 'turn_2',
      transcript: 'What is the recent transaction from yesterday morning?',
      durationMs: 1500,
      testBargeIn: true,
      bargeInOffsetMs: 350,
    },
  ],
  support: [
    {
      id: 'turn_1',
      transcript: 'I am calling regarding a billing discrepancy on invoice 8492.',
      durationMs: 1600,
      testBargeIn: false,
      bargeInOffsetMs: 400,
    },
    {
      id: 'turn_2',
      transcript: 'Can you please waive the late fee associated with it?',
      durationMs: 1300,
      testBargeIn: true,
      bargeInOffsetMs: 300,
    },
    {
      id: 'turn_3',
      transcript: 'Thank you, please email me the updated confirmation receipt.',
      durationMs: 1400,
      testBargeIn: false,
      bargeInOffsetMs: 400,
    },
  ],
  bargein_stress: [
    {
      id: 'turn_1',
      transcript: 'Stop right there, I want to interrupt immediately.',
      durationMs: 1200,
      testBargeIn: true,
      bargeInOffsetMs: 150,
    },
    {
      id: 'turn_2',
      transcript: 'Let me cut you off midway through your explanation.',
      durationMs: 1300,
      testBargeIn: true,
      bargeInOffsetMs: 400,
    },
    {
      id: 'turn_3',
      transcript: 'Wait, I have an urgent question before you finish speaking.',
      durationMs: 1400,
      testBargeIn: true,
      bargeInOffsetMs: 700,
    },
  ],
};

export function ScenarioBuilderModal({
  isOpen,
  onClose,
  scenarios: initialScenarios,
  onSave,
}: ScenarioBuilderModalProps) {
  const [scenarios, setScenarios] = useState<StudioScenario[]>(initialScenarios);

  if (!isOpen) return null;

  const handleUpdate = (index: number, field: keyof StudioScenario, value: unknown) => {
    setScenarios((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddTurn = () => {
    const nextId = `turn_${scenarios.length + 1}`;
    setScenarios((prev) => [
      ...prev,
      {
        id: nextId,
        transcript: 'New conversational inquiry transcript',
        durationMs: 1400,
        testBargeIn: false,
        bargeInOffsetMs: 400,
      },
    ]);
  };

  const handleRemoveTurn = (index: number) => {
    setScenarios((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLoadTemplate = (key: keyof typeof TEMPLATES) => {
    setScenarios(TEMPLATES[key]);
  };

  const handleExportJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(scenarios, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'voicelens-scenarios.json');
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed)) {
          setScenarios(parsed);
        }
      } catch (err) {
        alert('Invalid JSON scenario format');
      }
    };
    reader.readAsText(file);
  };

  const handleSaveAndApply = () => {
    onSave(scenarios);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050811]/85 p-4 overflow-y-auto">
      <div className="bg-[#0e1422] border border-cyan-500/30 rounded-2xl w-full max-w-3xl shadow-2xl p-6 flex flex-col gap-5 my-8 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold">
              📝
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Conversational Scenario Builder</h2>
              <p className="text-xs text-slate-400 font-mono">
                Design custom multi-turn dialogues, utterance timing, and interruption triggers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 text-sm font-mono cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Toolbar & Templates */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800 text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 uppercase text-[10px]">Templates:</span>
            <button
              onClick={() => handleLoadTemplate('banking')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 transition-all cursor-pointer"
            >
              Banking (2T)
            </button>
            <button
              onClick={() => handleLoadTemplate('support')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 transition-all cursor-pointer"
            >
              Support (3T)
            </button>
            <button
              onClick={() => handleLoadTemplate('bargein_stress')}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-rose-300 transition-all cursor-pointer"
            >
              Interruption Stress (3T)
            </button>
          </div>

          <div className="flex items-center gap-2">
            <label className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white cursor-pointer transition-all">
              Import JSON
              <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
            </label>
            <button
              onClick={handleExportJson}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
            >
              Export JSON
            </button>
          </div>
        </div>

        {/* Scenario List */}
        <div className="flex flex-col gap-3 overflow-y-auto pr-1 max-h-[50vh]">
          {scenarios.map((turn, idx) => (
            <div
              key={turn.id || idx}
              className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-950 text-cyan-400 border border-cyan-800 font-bold">
                    Turn {idx + 1}
                  </span>
                  <span className="text-xs font-mono text-slate-500">ID: {turn.id}</span>
                </div>
                {scenarios.length > 1 && (
                  <button
                    onClick={() => handleRemoveTurn(idx)}
                    className="text-xs font-mono text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>

              {/* Transcript input */}
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-mono text-slate-400 uppercase">
                  User Utterance Transcript:
                </label>
                <input
                  type="text"
                  value={turn.transcript}
                  onChange={(e) => handleUpdate(idx, 'transcript', e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-cyan-500/50"
                  placeholder="Enter caller speech transcript..."
                />
              </div>

              {/* Timing & Barge-in controls */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-slate-400 uppercase">Speech Duration:</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="500"
                      max="5000"
                      step="100"
                      value={turn.durationMs}
                      onChange={(e) => handleUpdate(idx, 'durationMs', Number(e.target.value))}
                      className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 w-24"
                    />
                    <span className="text-slate-500">ms</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-4">
                  <input
                    type="checkbox"
                    id={`bargein-${idx}`}
                    checked={turn.testBargeIn}
                    onChange={(e) => handleUpdate(idx, 'testBargeIn', e.target.checked)}
                    className="accent-rose-500 cursor-pointer"
                  />
                  <label htmlFor={`bargein-${idx}`} className="text-slate-300 cursor-pointer select-none">
                    Test Barge-in Interruption
                  </label>
                </div>

                {turn.testBargeIn && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-slate-400 uppercase">Interruption Offset:</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="100"
                        max="2000"
                        step="50"
                        value={turn.bargeInOffsetMs}
                        onChange={(e) => handleUpdate(idx, 'bargeInOffsetMs', Number(e.target.value))}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-rose-300 w-24"
                      />
                      <span className="text-slate-500">ms</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <button
            onClick={handleAddTurn}
            className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-cyan-400 font-mono text-xs font-semibold cursor-pointer transition-all"
          >
            + Add Turn
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg font-mono text-xs cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndApply}
              className="px-5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-mono text-xs font-bold rounded-lg cursor-pointer shadow-md shadow-cyan-950 active:scale-95 transition-all"
            >
              Apply Scenarios ({scenarios.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
