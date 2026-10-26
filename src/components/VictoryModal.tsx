import React from 'react';
import { Trophy, RotateCcw, Wrench } from 'lucide-react';
import { calculateClearanceStars } from '../game/rules.ts';
import { sound } from '../audio/synth.ts';

interface VictoryModalProps {
  clearancePct: number;
  totalScore: number;
  coinsEarned: number;
  maxCombo: number;
  onPlayAgain: () => void;
  onOpenGarage: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  clearancePct,
  totalScore,
  coinsEarned,
  maxCombo,
  onPlayAgain,
  onOpenGarage,
}) => {
  const stars = calculateClearanceStars(clearancePct);

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/75 select-none">
      <div className="w-full max-w-md rounded-3xl bg-[#0f172a] border border-slate-700 shadow-2xl p-6 md:p-8 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-400/30 flex items-center justify-center text-amber-400 mb-4 shadow-lg">
          <Trophy className="w-8 h-8" />
        </div>

        <h2 className="text-2xl md:text-3xl font-black text-white font-['Fredoka'] mb-1">
          ALPINE SHIFT COMPLETE!
        </h2>
        <p className="text-xs text-slate-400 font-mono mb-4">
          The township roads are safe & clear for morning traffic!
        </p>

        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((starIdx) => (
            <span
              key={starIdx}
              className={`text-3xl transition-transform ${
                starIdx <= stars ? 'text-amber-400 scale-110 drop-shadow' : 'text-slate-700'
              }`}
            >
              ★
            </span>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 w-full mb-6">
          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-left">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
              ROADS CLEARED
            </span>
            <span className="text-xl font-black text-sky-400 font-mono tabular-nums">
              {Math.round(clearancePct)}%
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-left">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
              BEST COMBO
            </span>
            <span className="text-xl font-black text-amber-400 font-mono tabular-nums">
              {maxCombo.toFixed(1)}x
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-left">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
              COINS EARNED
            </span>
            <div className="flex items-center gap-1">
              <span className="text-amber-300">🪙</span>
              <span className="text-xl font-black text-white font-mono tabular-nums">
                +{coinsEarned}
              </span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-left">
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider block mb-0.5">
              TOTAL SCORE
            </span>
            <span className="text-xl font-black text-white font-mono tabular-nums">
              {totalScore.toLocaleString()}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3 w-full">
          <button
            data-start="true"
            onClick={() => {
              sound.playClick();
              onPlayAgain();
            }}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-base shadow-xl shadow-sky-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <RotateCcw className="w-5 h-5" />
            <span>START NEXT SHIFT</span>
          </button>

          <button
            onClick={() => {
              sound.playClick();
              onOpenGarage();
            }}
            className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-700 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95"
          >
            <Wrench className="w-4 h-4 text-sky-400" />
            <span>VISIT GARAGE FOR UPGRADES</span>
          </button>
        </div>
      </div>
    </div>
  );
};
