import React from 'react';
import { X, Check, Building2, Trophy, Sparkles, MapPin, CheckCircle2 } from 'lucide-react';
import {
  CITY_CONTRACTS,
  CityContract,
  ContractProgress,
  isContractCompleted,
  calculateContractTotalReward,
} from '../game/rules.ts';
import { sound } from '../audio/synth.ts';

interface CityContractsModalProps {
  coins: number;
  activeContractId: string;
  progress: ContractProgress;
  completedContracts: string[];
  onSelectContract: (contractId: string) => void;
  onClaimContract: (contract: CityContract, reward: number) => void;
  onClose: () => void;
}

export const CityContractsModal: React.FC<CityContractsModalProps> = ({
  coins,
  activeContractId,
  progress,
  completedContracts,
  onSelectContract,
  onClaimContract,
  onClose,
}) => {
  const [selectedCityId, setSelectedCityId] = React.useState<string>(activeContractId);

  const city = CITY_CONTRACTS.find((c) => c.id === selectedCityId) || CITY_CONTRACTS[0];
  const isActive = activeContractId === city.id;
  const isCompletedAlready = completedContracts.includes(city.id);
  const meetsObjectives = isContractCompleted(city, progress);
  const canClaim = isActive && meetsObjectives && !isCompletedAlready;
  const reward = calculateContractTotalReward(city, progress);

  const handleSelect = (id: string) => {
    sound.playClick();
    setSelectedCityId(id);
    onSelectContract(id);
  };

  const handleClaim = () => {
    sound.playContractCompleteFanfare();
    onClaimContract(city, reward);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/65 select-none">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#0f172a] border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-800 bg-[#141e33]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/30 text-sky-400">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white font-['Fredoka']">
                CITY CONTRACTS & DEALERSHIP BOARD
              </h2>
              <p className="text-xs text-slate-400">
                Fulfill municipal clearing orders across mountain towns for grand cash declarations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 font-mono text-amber-300 font-bold">
              <span>🪙</span>
              <span className="tabular-nums text-base">{coins}</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Close Contracts Board"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* City Dealerships List (Left) */}
          <div className="md:col-span-5 flex flex-col gap-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Select Municipal Contract
            </span>
            {CITY_CONTRACTS.map((c) => {
              const isCurrent = c.id === selectedCityId;
              const active = c.id === activeContractId;
              const completed = completedContracts.includes(c.id);

              return (
                <button
                  key={c.id}
                  onClick={() => {
                    sound.playClick();
                    setSelectedCityId(c.id);
                  }}
                  className={`flex flex-col p-4 rounded-2xl border text-left transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-slate-800/95 border-sky-400 ring-2 ring-sky-400/20'
                      : 'bg-slate-900/60 hover:bg-slate-800/50 border-slate-800'
                  }`}
                >
                  <div className="flex justify-between items-start w-full mb-1">
                    <span className="text-xs font-mono text-sky-400 font-semibold uppercase">
                      {c.tier}
                    </span>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold ${
                        c.sizeCategory === 'Large'
                          ? 'bg-purple-500/20 text-purple-300'
                          : c.sizeCategory === 'Medium'
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-emerald-500/20 text-emerald-300'
                      }`}
                    >
                      {c.sizeCategory} City
                    </span>
                  </div>

                  <div className="flex justify-between items-center w-full">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-base font-['Fredoka']">{c.cityName}</span>
                      {active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold">
                          ACTIVE
                        </span>
                      )}
                      {completed && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>

                    <div className="flex items-center gap-1 font-mono text-amber-300 font-bold text-sm">
                      <span>🪙</span>
                      <span>{c.basePayout}+</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detailed Contract Objectives & Payout (Right) */}
          <div className="md:col-span-7 flex flex-col justify-between p-6 rounded-2xl bg-[#141e33]/90 border border-slate-700/80">
            <div>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="text-xs font-mono text-sky-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-400" /> {city.dealershipName}
                  </span>
                  <h3 className="text-2xl font-black text-white font-['Fredoka'] mt-0.5">
                    {city.cityName}
                  </h3>
                </div>

                <div className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-300 font-mono font-bold text-sm">
                  🪙 {city.basePayout} Base
                </div>
              </div>

              <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                {city.description}
              </p>

              {/* Work Orders Checklist */}
              <div className="flex flex-col gap-3 mb-6">
                <span className="text-xs font-mono text-slate-400 uppercase tracking-wider font-semibold">
                  Required Work Orders
                </span>

                {/* 1. Road Clearance */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-sm text-white font-semibold block">
                      1. Plow Town Roads & Crossways
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Target: {city.requiredClearancePct}% · Current: {Math.round(progress.clearancePct)}%
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg ${
                      progress.clearancePct >= city.requiredClearancePct
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {progress.clearancePct >= city.requiredClearancePct ? 'COMPLETED ✓' : 'INCOMPLETE'}
                  </span>
                </div>

                {/* 2. Cabin Porch Hand-Shoveling */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-sm text-white font-semibold block">
                      2. Shovel Cabin Porches (On Foot)
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Target: {city.requiredPorches} Porches · Done: {progress.porchesShoveled}/{city.requiredPorches}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg ${
                      progress.porchesShoveled >= city.requiredPorches
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {progress.porchesShoveled >= city.requiredPorches ? 'COMPLETED ✓' : 'INCOMPLETE'}
                  </span>
                </div>

                {/* 3. Rooftop Snow Raking */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-sm text-white font-semibold block">
                      3. Rake Chalet Roof Snow (On Foot)
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Target: {city.requiredRoofs} Roofs · Cleared: {progress.roofsRaked}/{city.requiredRoofs}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg ${
                      progress.roofsRaked >= city.requiredRoofs
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {progress.roofsRaked >= city.requiredRoofs ? 'COMPLETED ✓' : 'INCOMPLETE'}
                  </span>
                </div>

                {/* 4. Plow Combo Tier */}
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-sm text-white font-semibold block">
                      4. Achieve Snowdrift Combo Streak
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      Target: {city.requiredComboTier}x Combo · Best: {progress.maxCombo.toFixed(1)}x
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xs font-bold px-2.5 py-1 rounded-lg ${
                      progress.maxCombo >= city.requiredComboTier
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {progress.maxCombo >= city.requiredComboTier ? 'COMPLETED ✓' : 'INCOMPLETE'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-4 pt-4 border-t border-slate-700/60 flex flex-col gap-2">
              {canClaim ? (
                <button
                  onClick={handleClaim}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-bold text-base shadow-xl shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 animate-bounce-subtle"
                >
                  <Trophy className="w-5 h-5 text-amber-300" />
                  <span>CLAIM CONTRACT PAYOUT: +🪙 {reward} COINS!</span>
                </button>
              ) : isActive ? (
                <div className="w-full py-3.5 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-300 text-xs font-mono font-bold flex items-center justify-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
                  <span>CURRENT CONTRACT IN PROGRESS · COMPLETE ORDERS ABOVE</span>
                </div>
              ) : (
                <button
                  onClick={() => handleSelect(city.id)}
                  className="w-full py-3.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-95 shadow-lg shadow-sky-950/40"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>ACCEPT THIS MUNICIPAL CONTRACT</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
