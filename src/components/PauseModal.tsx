import React from 'react';
import { Play, RotateCcw, Wrench, Home } from 'lucide-react';
import { sound } from '../audio/synth.ts';

interface PauseModalProps {
  onResume: () => void;
  onRestart: () => void;
  onOpenGarage: () => void;
  onBackToTitle: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onRestart,
  onOpenGarage,
  onBackToTitle,
}) => {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/65 select-none">
      <div className="w-full max-w-sm rounded-3xl bg-[#0f172a] border border-slate-700/80 shadow-2xl p-6 text-center">
        <h2 className="text-2xl font-black text-white font-['Fredoka'] mb-1">
          SHIFT PAUSED
        </h2>
        <p className="text-xs text-slate-400 mb-6 font-mono">
          Engine idling · Snowdrifts waiting
        </p>

        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              sound.playClick();
              onResume();
            }}
            className="w-full py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-sm shadow-lg shadow-sky-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>RESUME PLOWING</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              onOpenGarage();
            }}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Wrench className="w-4 h-4 text-sky-400" />
            <span>GARAGE & PLOWS [G]</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              onRestart();
            }}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>RESTART SHIFT</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              onBackToTitle();
            }}
            className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 font-bold text-sm border border-slate-800 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Home className="w-4 h-4 text-slate-400" />
            <span>RETURN TO TITLE</span>
          </button>
        </div>
      </div>
    </div>
  );
};
