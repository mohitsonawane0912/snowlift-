import React from 'react';
import { Volume2, VolumeX, Sparkles, Wrench } from 'lucide-react';
import { sound } from '../audio/synth.ts';

interface TitleScreenProps {
  onStart: () => void;
  onOpenGarage: () => void;
  coins: number;
  equippedVehicleName: string;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStart,
  onOpenGarage,
  coins,
  equippedVehicleName,
}) => {
  const [isMuted, setIsMuted] = React.useState(sound.getIsMuted());

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-6 md:p-8 select-none z-20">
      {/* Top Header Bar */}
      <div className="flex justify-between items-center w-full">
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0b1324]/90 border border-slate-700 text-slate-200 text-xs font-mono shadow-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>ALPINE TOWNSHIP · SHIFT 1</span>
        </div>

        <div className="flex items-center gap-3 pointer-events-auto">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#0b1324]/90 border border-slate-700 text-amber-300 font-mono text-sm shadow-lg">
            <span>🪙</span>
            <span className="font-bold tabular-nums">{coins}</span>
          </div>
          <button
            onClick={handleToggleMute}
            className="p-2.5 rounded-xl bg-[#0b1324]/90 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shadow-lg"
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      </div>

      {/* Main Title Centerpiece - Contained in solid/rgba card for contrast */}
      <div className="flex flex-col items-center justify-center text-center max-w-lg mx-auto pointer-events-auto p-7 md:p-8 rounded-3xl bg-[#0b1324]/92 border border-slate-700/80 shadow-2xl shadow-slate-950/60">
        {/* Bespoke inline SVG Emblem & Title Lockup */}
        <div className="relative mb-3 flex flex-col items-center">
          <svg className="w-16 h-16 mb-2 drop-shadow-lg" viewBox="0 0 80 80" fill="none">
            {/* Hexagonal Winter Crest */}
            <polygon
              points="40,4 72,22 72,58 40,76 8,58 8,22"
              fill="#1e293b"
              stroke="#38bdf8"
              strokeWidth="2.5"
            />
            {/* Inner Snowflake pattern */}
            <line x1="40" y1="14" x2="40" y2="66" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="16" y1="26" x2="64" y2="54" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="16" y1="54" x2="64" y2="26" stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round" />
            {/* Golden plow blade silhouette icon */}
            <path
              d="M24,48 L56,48 L52,56 L28,56 Z"
              fill="#f59e0b"
              stroke="#fbbf24"
              strokeWidth="1.5"
            />
          </svg>

          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow font-['Fredoka']">
            SNOWDRIFT
          </h1>
          <div className="text-xs md:text-sm font-semibold tracking-widest uppercase text-sky-400 mt-0.5 font-mono">
            Cozy 3D Winter Plow
          </div>
        </div>

        <p className="text-slate-300 text-xs md:text-sm max-w-sm mb-6 leading-relaxed">
          Clear snowy mountain roads, keep the alpine village cozy, maintain continuous plow combos, and discover hidden winter treasures!
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full justify-center">
          <button
            data-start="true"
            onClick={onStart}
            className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-base shadow-xl shadow-sky-950/40 border border-sky-300/40 cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          >
            <Sparkles className="w-5 h-5 text-amber-300" />
            <span>START PLOWING</span>
          </button>

          <button
            onClick={onOpenGarage}
            className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm border border-slate-600/70 cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
          >
            <Wrench className="w-4 h-4 text-sky-400" />
            <span>GARAGE · {equippedVehicleName}</span>
          </button>
        </div>
      </div>

      {/* Bottom Single-Line Control Hint */}
      <div className="text-center w-full pointer-events-none">
        <div className="inline-block px-4 py-2 rounded-xl bg-[#0b1324]/90 border border-slate-800 text-xs md:text-sm text-slate-300 font-mono shadow-lg">
          WASD / Arrows Move · Space Boost · E Salt · G Garage · M Mute · Esc Pause
        </div>
      </div>
    </div>
  );
};
