import React from 'react';
import { X, Check, Lock, Sparkles, Wrench, Shield, Wind } from 'lucide-react';
import {
  VEHICLE_CATALOG,
  VehicleStats,
  VehicleUpgradeLevels,
  getUpgradeCost,
  canUnlockVehicle,
  calculateEffectiveStats,
} from '../game/rules.ts';
import { sound } from '../audio/synth.ts';

interface GarageModalProps {
  coins: number;
  unlockedVehicles: string[];
  equippedVehicleId: string;
  upgrades: VehicleUpgradeLevels;
  onSelectVehicle: (id: string) => void;
  onUnlockVehicle: (id: string, cost: number) => void;
  onUpgradePart: (part: keyof VehicleUpgradeLevels, cost: number) => void;
  onClose: () => void;
}

export const GarageModal: React.FC<GarageModalProps> = ({
  coins,
  unlockedVehicles,
  equippedVehicleId,
  upgrades,
  onSelectVehicle,
  onUnlockVehicle,
  onUpgradePart,
  onClose,
}) => {
  const [activeTab, setActiveTab] = React.useState<'vehicles' | 'upgrades'>('vehicles');
  const [previewVehicleId, setPreviewVehicleId] = React.useState<string>(equippedVehicleId);

  const previewVehicle = VEHICLE_CATALOG.find((v) => v.id === previewVehicleId) || VEHICLE_CATALOG[0];
  const isUnlocked = unlockedVehicles.includes(previewVehicle.id);
  const isEquipped = equippedVehicleId === previewVehicle.id;
  const canBuy = canUnlockVehicle(previewVehicle, coins, unlockedVehicles);

  const effectiveStats = calculateEffectiveStats(previewVehicle, upgrades);

  const handleEquip = (id: string) => {
    sound.playClick();
    onSelectVehicle(id);
  };

  const handleBuy = (vehicle: VehicleStats) => {
    if (canBuy) {
      sound.playUpgrade();
      onUnlockVehicle(vehicle.id, vehicle.price);
    }
  };

  const handleUpgrade = (part: keyof VehicleUpgradeLevels) => {
    const currentLvl = upgrades[part];
    const cost = getUpgradeCost(currentLvl);
    if (coins >= cost && currentLvl < 3) {
      sound.playUpgrade();
      onUpgradePart(part, cost);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-black/60 select-none">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl bg-[#0f172a] border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-800 bg-[#141e33]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-sky-500/10 border border-sky-400/30 text-sky-400">
              <Wrench className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl md:text-2xl font-black text-white font-['Fredoka']">
                ALPINE VEHICLE GARAGE
              </h2>
              <p className="text-xs text-slate-400">
                Unlock specialized snow plows & enhance heavy-duty winter gear
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
              aria-label="Close Garage"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800 bg-[#0b1120] px-6">
          <button
            onClick={() => setActiveTab('vehicles')}
            className={`py-3 px-5 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
              activeTab === 'vehicles'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Plow Fleet ({unlockedVehicles.length}/{VEHICLE_CATALOG.length})
          </button>
          <button
            onClick={() => setActiveTab('upgrades')}
            className={`py-3 px-5 font-semibold text-sm transition-all border-b-2 cursor-pointer ${
              activeTab === 'upgrades'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Hardware Tuning & Upgrades
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'vehicles' ? (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              <div className="md:col-span-5 flex flex-col gap-3">
                <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
                  Select Model
                </span>
                {VEHICLE_CATALOG.map((v) => {
                  const unlocked = unlockedVehicles.includes(v.id);
                  const isSelected = v.id === previewVehicleId;
                  const equipped = v.id === equippedVehicleId;

                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        sound.playClick();
                        setPreviewVehicleId(v.id);
                      }}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-800/90 border-sky-400 ring-2 ring-sky-400/20'
                          : 'bg-slate-900/60 hover:bg-slate-800/50 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shadow"
                          style={{ backgroundColor: v.color }}
                        >
                          {!unlocked ? <Lock className="w-4 h-4 text-white/80" /> : '❄'}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">{v.name}</span>
                            {equipped && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono font-bold">
                                ACTIVE
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">{v.subtitle}</span>
                        </div>
                      </div>

                      <div>
                        {unlocked ? (
                          <span className="text-xs text-emerald-400 font-mono font-bold">OWNED</span>
                        ) : (
                          <div className="flex items-center gap-1 text-xs font-mono text-amber-300 font-bold">
                            <span>🪙</span>
                            <span>{v.price}</span>
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="md:col-span-7 flex flex-col justify-between p-6 rounded-2xl bg-[#141e33]/90 border border-slate-700/80">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className="text-xs font-mono text-sky-400 uppercase tracking-widest font-semibold">
                        {previewVehicle.subtitle}
                      </span>
                      <h3 className="text-2xl font-black text-white font-['Fredoka'] mt-0.5">
                        {previewVehicle.name}
                      </h3>
                    </div>

                    <div
                      className="px-3 py-1 rounded-lg text-xs font-mono font-bold text-white"
                      style={{ backgroundColor: previewVehicle.color }}
                    >
                      COLOR REF
                    </div>
                  </div>

                  <p className="text-sm text-slate-300 mb-6 leading-relaxed">
                    {previewVehicle.description}
                  </p>

                  <div className="flex flex-col gap-3.5 mb-6">
                    <div>
                      <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Wind className="w-3.5 h-3.5 text-sky-400" /> TOP SPEED
                        </span>
                        <span className="font-bold text-white tabular-nums">
                          {Math.round(effectiveStats.maxSpeed * 2.8)} KM/H
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-sky-400 rounded-full"
                          style={{ width: `${(effectiveStats.maxSpeed / 28) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Shield className="w-3.5 h-3.5 text-amber-400" /> CLEARING SWATH (BLADE)
                        </span>
                        <span className="font-bold text-white tabular-nums">
                          {effectiveStats.bladeWidth.toFixed(1)} METERS
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-amber-400 rounded-full"
                          style={{ width: `${(effectiveStats.bladeWidth / 5.5) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" /> SALT DISPENSER CAPACITY
                        </span>
                        <span className="font-bold text-white tabular-nums">
                          {effectiveStats.saltCapacity} UNITS
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-cyan-400 rounded-full"
                          style={{ width: `${(effectiveStats.saltCapacity / 420) * 100}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                        <span>TURNING AGILITY</span>
                        <span className="font-bold text-white tabular-nums">
                          {(effectiveStats.turnRate * 10).toFixed(0)} PTS
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-400 rounded-full"
                          style={{ width: `${(effectiveStats.turnRate / 3.5) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-700/60">
                  {isUnlocked ? (
                    <button
                      disabled={isEquipped}
                      onClick={() => handleEquip(previewVehicle.id)}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        isEquipped
                          ? 'bg-slate-800 text-slate-400 cursor-default'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 active:scale-95'
                      }`}
                    >
                      {isEquipped ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span>CURRENTLY EQUIPPED</span>
                        </>
                      ) : (
                        <span>SELECT THIS PLOW</span>
                      )}
                    </button>
                  ) : (
                    <button
                      disabled={!canBuy}
                      onClick={() => handleBuy(previewVehicle)}
                      className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        canBuy
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-950/40 active:scale-95'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      }`}
                    >
                      <Lock className="w-4 h-4" />
                      <span>UNLOCK FOR {previewVehicle.price} SNOW COINS</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-2xl bg-[#141e33] border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white text-base">Heavy Engine Tuning</span>
                    <span className="text-xs font-mono font-bold text-sky-400">
                      LVL {upgrades.engineLevel}/3
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Increases top speed and heavy-drift push torque by +12% per level.
                  </p>
                </div>
                <div>
                  {upgrades.engineLevel < 3 ? (
                    <button
                      onClick={() => handleUpgrade('engineLevel')}
                      disabled={coins < getUpgradeCost(upgrades.engineLevel)}
                      className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                        coins >= getUpgradeCost(upgrades.engineLevel)
                          ? 'bg-sky-500 hover:bg-sky-400 text-white shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Upgrade: 🪙 {getUpgradeCost(upgrades.engineLevel)} Coins
                    </button>
                  ) : (
                    <div className="text-center py-2 text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 rounded-xl">
                      MAX LEVEL REACHED
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#141e33] border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white text-base">Blade Swath Extension</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      LVL {upgrades.bladeLevel}/3
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Widens clearing swath radius by +15%, scooping more snow per pass.
                  </p>
                </div>
                <div>
                  {upgrades.bladeLevel < 3 ? (
                    <button
                      onClick={() => handleUpgrade('bladeLevel')}
                      disabled={coins < getUpgradeCost(upgrades.bladeLevel)}
                      className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                        coins >= getUpgradeCost(upgrades.bladeLevel)
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Upgrade: 🪙 {getUpgradeCost(upgrades.bladeLevel)} Coins
                    </button>
                  ) : (
                    <div className="text-center py-2 text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 rounded-xl">
                      MAX LEVEL REACHED
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#141e33] border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white text-base">Heated Salt Dispenser</span>
                    <span className="text-xs font-mono font-bold text-cyan-400">
                      LVL {upgrades.saltLevel}/3
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Expands passive salt melt radius and hopper capacity by +20%.
                  </p>
                </div>
                <div>
                  {upgrades.saltLevel < 3 ? (
                    <button
                      onClick={() => handleUpgrade('saltLevel')}
                      disabled={coins < getUpgradeCost(upgrades.saltLevel)}
                      className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                        coins >= getUpgradeCost(upgrades.saltLevel)
                          ? 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Upgrade: 🪙 {getUpgradeCost(upgrades.saltLevel)} Coins
                    </button>
                  ) : (
                    <div className="text-center py-2 text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 rounded-xl">
                      MAX LEVEL REACHED
                    </div>
                  )}
                </div>
              </div>

              <div className="p-5 rounded-2xl bg-[#141e33] border border-slate-700 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-white text-base">Thermal Nitro Booster</span>
                    <span className="text-xs font-mono font-bold text-orange-400">
                      LVL {upgrades.boostLevel}/3
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">
                    Lengthens thermal boost duration by +0.8s and shortens recharge time.
                  </p>
                </div>
                <div>
                  {upgrades.boostLevel < 3 ? (
                    <button
                      onClick={() => handleUpgrade('boostLevel')}
                      disabled={coins < getUpgradeCost(upgrades.boostLevel)}
                      className={`w-full py-2.5 rounded-xl font-mono text-xs font-bold transition-all cursor-pointer ${
                        coins >= getUpgradeCost(upgrades.boostLevel)
                          ? 'bg-orange-500 hover:bg-orange-400 text-white shadow'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      Upgrade: 🪙 {getUpgradeCost(upgrades.boostLevel)} Coins
                    </button>
                  ) : (
                    <div className="text-center py-2 text-xs font-mono text-emerald-400 font-bold bg-emerald-500/10 rounded-xl">
                      MAX LEVEL REACHED
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
