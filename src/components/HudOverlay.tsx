import React from 'react';
import { Volume2, VolumeX, Wrench, Pause, Zap, Sparkles, Building2, User, Truck, Wind, AlertTriangle, ShieldAlert } from 'lucide-react';
import { sound } from '../audio/synth.ts';
import { WeatherConfig } from '../game/rules.ts';

interface HudOverlayProps {
  clearancePct: number;
  coins: number;
  comboCount: number;
  comboMultiplier: number;
  comboTitle: string;
  comboDecayProgress: number;
  speedKmH: number;
  boostCharge: number;
  saltRemaining: number;
  vehicleName: string;
  controlMode: 'vehicle' | 'foot';
  nearVehicle: boolean;
  nearWorkOrderPrompt: string | null;
  activeCityName: string;
  porchesDone: number;
  porchesTarget: number;
  roofsDone: number;
  roofsTarget: number;
  weatherConfig: WeatherConfig;
  municipalFineAlert: { amount: number; reason: string } | null;
  checkpointWarning: string | null;
  onOpenGarage: () => void;
  onOpenContracts: () => void;
  onToggleVehicleMode: () => void;
  onPause: () => void;
  onMobileInput: (action: string, isPressed: boolean) => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  clearancePct,
  coins,
  comboCount,
  comboMultiplier,
  comboTitle,
  comboDecayProgress,
  speedKmH,
  boostCharge,
  saltRemaining,
  vehicleName,
  controlMode,
  nearVehicle,
  nearWorkOrderPrompt,
  activeCityName,
  porchesDone,
  porchesTarget,
  roofsDone,
  roofsTarget,
  weatherConfig,
  municipalFineAlert,
  checkpointWarning,
  onOpenGarage,
  onOpenContracts,
  onToggleVehicleMode,
  onPause,
  onMobileInput,
}) => {
  const [isMuted, setIsMuted] = React.useState(sound.getIsMuted());

  const handleToggleMute = () => {
    const muted = sound.toggleMute();
    setIsMuted(muted);
  };

  return (
    <div className="fixed inset-0 pointer-events-none select-none z-10 flex flex-col justify-between p-3 md:p-6">
      {/* Top Bar: Corner Clusters */}
      <div className="flex justify-between items-start w-full gap-2">
        {/* Top-Left: Town Clearance & Active City Contract Checklist */}
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-[#0f172a]/92 border border-slate-700/80 shadow-2xl pointer-events-auto min-w-[210px] max-w-xs backdrop-blur-sm">
          <div className="flex justify-between items-center text-xs font-mono text-slate-300">
            <span className="font-semibold uppercase tracking-wider text-sky-300">
              {activeCityName}
            </span>
            <span className="font-bold tabular-nums text-white">{Math.round(clearancePct)}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, clearancePct)}%` }}
            />
          </div>

          {/* Mini Work Order Progress */}
          <div className="flex flex-col gap-1 pt-1 border-t border-slate-800 text-[11px] font-mono">
            <div className="flex justify-between text-slate-300">
              <span>Porches Shoveled:</span>
              <span className={porchesDone >= porchesTarget ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                {porchesDone}/{porchesTarget} {porchesDone >= porchesTarget && '✓'}
              </span>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>Roofs Raked:</span>
              <span className={roofsDone >= roofsTarget ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                {roofsDone}/{roofsTarget} {roofsDone >= roofsTarget && '✓'}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Center: Weather Station & Blizzard Warning Widget */}
        <div className="flex flex-col items-center gap-1.5 pointer-events-auto">
          {/* Dynamic Weather Indicator */}
          <div className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-2xl border shadow-xl backdrop-blur-sm transition-all duration-500 ${
            weatherConfig.isBlizzardAlert
              ? 'bg-rose-950/90 border-rose-500 text-rose-200 animate-pulse'
              : 'bg-[#0f172a]/90 border-sky-600/50 text-slate-200'
          }`}>
            <span className="text-base">{weatherConfig.icon}</span>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold font-mono tracking-wide">
                  {weatherConfig.name}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800/80 text-sky-300 font-mono">
                  {weatherConfig.temperatureC}°C
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400">
                <span className="flex items-center gap-0.5">
                  <Wind className="w-3 h-3 text-sky-400" /> {weatherConfig.windSpeedKmH} km/h
                </span>
                <span>•</span>
                <span>Vis: {weatherConfig.visibilityMeters}m</span>
                {weatherConfig.accumulationRatePerSec > 0 && (
                  <>
                    <span>•</span>
                    <span className="text-amber-300 font-semibold">+{weatherConfig.snowfallCmPerHour} cm/h</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Blizzard Hazard Banner */}
          {weatherConfig.isBlizzardAlert && (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-500/90 text-slate-950 font-bold text-[11px] font-mono border border-amber-300 shadow-lg animate-bounce-subtle">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>RAPID SNOW RE-ACCUMULATION ACTIVE</span>
            </div>
          )}

          {/* Municipal Safety Fine Alert Notification */}
          {municipalFineAlert && (
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-rose-600 text-white font-mono font-bold text-xs shadow-2xl border-2 border-rose-300 animate-bounce">
              <ShieldAlert className="w-5 h-5 text-amber-300 shrink-0" />
              <div className="flex flex-col text-left">
                <span className="text-amber-200 tracking-wider font-extrabold uppercase">
                  MUNICIPAL SAFETY FINE: -${municipalFineAlert.amount} COINS
                </span>
                <span className="text-[11px] text-rose-100 font-medium">
                  {municipalFineAlert.reason}
                </span>
              </div>
            </div>
          )}

          {/* Highway Checkpoint Notice (Entry / Exit Barrier Warnings) */}
          {checkpointWarning && (
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-slate-900/95 text-amber-300 font-mono font-bold text-xs shadow-2xl border border-amber-400">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{checkpointWarning}</span>
            </div>
          )}

          {/* Dynamic Combo Multiplier (When active) */}
          {comboMultiplier > 1.0 && (
            <div className="flex flex-col items-center p-2.5 rounded-2xl bg-[#0f172a]/92 border border-amber-500/50 shadow-xl shadow-amber-950/20">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span className="text-xl md:text-2xl font-black text-amber-400 font-['Fredoka'] tabular-nums tracking-wide">
                  {comboMultiplier.toFixed(1)}x
                </span>
                <span className="text-xs font-bold text-amber-200 tracking-wider font-mono">
                  {comboTitle}
                </span>
              </div>

              <div className="w-28 h-1.5 rounded-full bg-slate-800 overflow-hidden mt-1 border border-amber-500/30">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all duration-75"
                  style={{ width: `${Math.max(0, Math.min(100, comboDecayProgress * 100))}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-400 font-mono mt-0.5">{comboCount} drifts scooped</span>
            </div>
          )}
        </div>

        {/* Top-Right: Currency, Contracts, Garage, Sound, Pause */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Snow Coins */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f172a]/90 border border-slate-700/60 shadow-lg text-amber-300 font-mono font-bold text-sm">
            <span>🪙</span>
            <span className="tabular-nums">{coins}</span>
          </div>

          {/* City Contracts Board */}
          <button
            onClick={onOpenContracts}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f172a]/90 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs font-semibold cursor-pointer shadow-lg transition-colors"
            title="City Contracts & Dealership Board [O]"
          >
            <Building2 className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">CONTRACTS [O]</span>
          </button>

          {/* Garage */}
          <button
            onClick={onOpenGarage}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#0f172a]/90 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-xs font-semibold cursor-pointer shadow-lg transition-colors"
            title="Open Vehicle Garage [G]"
          >
            <Wrench className="w-4 h-4 text-sky-400" />
            <span className="hidden sm:inline">GARAGE [G]</span>
          </button>

          {/* Audio Mute */}
          <button
            onClick={handleToggleMute}
            className="p-2 rounded-xl bg-[#0f172a]/90 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white cursor-pointer shadow-lg transition-colors"
            aria-label={isMuted ? 'Unmute Sound' : 'Mute Sound'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Pause */}
          <button
            onClick={onPause}
            className="p-2 rounded-xl bg-[#0f172a]/90 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-white cursor-pointer shadow-lg transition-colors"
            title="Pause Game [Esc]"
            aria-label="Pause"
          >
            <Pause className="w-4 h-4 text-slate-300" />
          </button>
        </div>
      </div>

      {/* Interactive On-Foot Work Order Notification */}
      {nearWorkOrderPrompt && (
        <div className="fixed top-48 left-1/2 -translate-x-1/2 z-20 px-5 py-2.5 rounded-2xl bg-sky-500 text-white font-bold text-sm shadow-2xl border border-sky-300 flex items-center gap-2 pointer-events-none font-['Fredoka'] animate-bounce-subtle">
          <span>❄ {nearWorkOrderPrompt}</span>
        </div>
      )}

      {/* Bottom Area: Unified Dashboard + Mobile Controls */}
      <div className="flex flex-col items-center w-full gap-2 pointer-events-none mt-auto">
        {/* Dashboard Bar */}
        <div className="flex items-center justify-between gap-3 max-w-md w-full p-2.5 px-4 rounded-2xl bg-[#0f172a]/92 border border-slate-700/80 shadow-2xl pointer-events-auto backdrop-blur-sm">
          {/* Mode Switcher Button (Vehicle vs On-Foot) */}
          <button
            onClick={onToggleVehicleMode}
            disabled={controlMode === 'foot' && !nearVehicle}
            className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
              controlMode === 'vehicle'
                ? 'bg-slate-800 hover:bg-slate-700 border-slate-600 text-slate-200'
                : nearVehicle
                ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-400 text-white animate-pulse'
                : 'bg-slate-900 border-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            title="Toggle Vehicle / On-Foot [F]"
          >
            {controlMode === 'vehicle' ? (
              <>
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>EXIT [F]</span>
              </>
            ) : (
              <>
                <Truck className="w-3.5 h-3.5 text-sky-400" />
                <span>ENTER [F]</span>
              </>
            )}
          </button>

          {/* Current Mode / Vehicle Readout */}
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-sky-300 tracking-wider uppercase font-mono">
              {controlMode === 'vehicle' ? vehicleName : 'ON FOOT (SHOVEL & RAKE)'}
            </span>
            <div className="flex items-baseline gap-1 font-mono">
              <span className="text-lg font-black text-white tabular-nums">{speedKmH}</span>
              <span className="text-[10px] text-slate-400">KM/H</span>
            </div>
          </div>

          {/* Boost Gauge (when in vehicle) or Shovel indicator */}
          {controlMode === 'vehicle' ? (
            <>
              <div className="flex flex-col items-center flex-1 max-w-[100px]">
                <div className="flex justify-between items-center w-full text-[10px] font-mono text-slate-300 mb-1">
                  <span className="flex items-center gap-0.5 text-amber-400 font-bold">
                    <Zap className="w-3 h-3 fill-amber-400" /> BOOST
                  </span>
                  <span className="text-slate-400">[SPACE]</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-orange-400 rounded-full transition-all duration-100"
                    style={{ width: `${boostCharge * 100}%` }}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center flex-1 max-w-[90px]">
                <div className="flex justify-between items-center w-full text-[10px] font-mono text-slate-300 mb-1">
                  <span className="text-cyan-300 font-bold">SALT</span>
                  <span className="text-slate-400">[E]</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700">
                  <div
                    className="h-full bg-cyan-400 rounded-full transition-all duration-100"
                    style={{ width: `${saltRemaining * 100}%` }}
                  />
                </div>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 text-xs font-mono text-sky-300 font-semibold">
              <span>[SPACE] Shovel Porch / Rake Roof</span>
            </div>
          )}
        </div>

        {/* On-Screen Mobile Touch Controls */}
        <div className="md:hidden flex justify-between items-end w-full px-2 pointer-events-auto">
          <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#0f172a]/85 rounded-2xl border border-slate-700">
            <div />
            <button
              onPointerDown={() => onMobileInput('forward', true)}
              onPointerUp={() => onMobileInput('forward', false)}
              className="w-11 h-11 rounded-xl bg-slate-800 active:bg-sky-600 text-white font-bold flex items-center justify-center text-base cursor-pointer"
            >
              ▲
            </button>
            <div />
            <button
              onPointerDown={() => onMobileInput('left', true)}
              onPointerUp={() => onMobileInput('left', false)}
              className="w-11 h-11 rounded-xl bg-slate-800 active:bg-sky-600 text-white font-bold flex items-center justify-center text-base cursor-pointer"
            >
              ◀
            </button>
            <button
              onPointerDown={() => onMobileInput('backward', true)}
              onPointerUp={() => onMobileInput('backward', false)}
              className="w-11 h-11 rounded-xl bg-slate-800 active:bg-sky-600 text-white font-bold flex items-center justify-center text-base cursor-pointer"
            >
              ▼
            </button>
            <button
              onPointerDown={() => onMobileInput('right', true)}
              onPointerUp={() => onMobileInput('right', false)}
              className="w-11 h-11 rounded-xl bg-slate-800 active:bg-sky-600 text-white font-bold flex items-center justify-center text-base cursor-pointer"
            >
              ▶
            </button>
          </div>

          <div className="flex flex-col gap-1.5">
            {controlMode === 'vehicle' ? (
              <>
                <button
                  onPointerDown={() => onMobileInput('boost', true)}
                  onPointerUp={() => onMobileInput('boost', false)}
                  className="w-16 h-10 rounded-xl bg-amber-600 active:bg-amber-500 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-lg cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-white" /> BOOST
                </button>
                <button
                  onPointerDown={() => onMobileInput('salt', true)}
                  onPointerUp={() => onMobileInput('salt', false)}
                  className="w-16 h-10 rounded-xl bg-cyan-700 active:bg-cyan-600 text-white font-bold text-xs flex items-center justify-center shadow-lg cursor-pointer"
                >
                  SALT
                </button>
              </>
            ) : (
              <button
                onPointerDown={() => onMobileInput('action', true)}
                onPointerUp={() => onMobileInput('action', false)}
                className="w-20 h-14 rounded-xl bg-sky-600 active:bg-sky-500 text-white font-bold text-xs flex items-center justify-center shadow-lg cursor-pointer"
              >
                SHOVEL / RAKE
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
