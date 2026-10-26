import React, { useEffect, useRef, useState } from 'react';
import { SnowGameWorld } from './game/threeScene.ts';
import { TitleScreen } from './components/TitleScreen.tsx';
import { HudOverlay } from './components/HudOverlay.tsx';
import { GarageModal } from './components/GarageModal.tsx';
import { CityContractsModal } from './components/CityContractsModal.tsx';
import { PauseModal } from './components/PauseModal.tsx';
import { VictoryModal } from './components/VictoryModal.tsx';
import {
  VEHICLE_CATALOG,
  VehicleUpgradeLevels,
  getComboMultiplier,
  getComboTitle,
  calculatePlowYield,
  CITY_CONTRACTS,
  CityContract,
  WEATHER_CONFIGS,
  WeatherConfig,
  WeatherStage,
  applyMunicipalFine,
} from './game/rules.ts';
import { sound } from './audio/synth.ts';

type GameState = 'title' | 'playing' | 'paused' | 'gameover';

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<SnowGameWorld | null>(null);

  const [gameState, setGameState] = useState<GameState>('title');
  const [isGarageOpen, setIsGarageOpen] = useState<boolean>(false);
  const [isContractsOpen, setIsContractsOpen] = useState<boolean>(false);

  // Persistent Economy & Vehicle Inventory
  const [coins, setCoins] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('snowdrift_coins');
      return saved ? parseInt(saved, 10) : 50;
    } catch {
      return 50;
    }
  });

  const [unlockedVehicles, setUnlockedVehicles] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('snowdrift_unlocked');
      return saved ? JSON.parse(saved) : ['cub-cadet'];
    } catch {
      return ['cub-cadet'];
    }
  });

  const [equippedVehicleId, setEquippedVehicleId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('snowdrift_equipped');
      return saved || 'cub-cadet';
    } catch {
      return 'cub-cadet';
    }
  });

  const [upgrades, setUpgrades] = useState<VehicleUpgradeLevels>(() => {
    try {
      const saved = localStorage.getItem('snowdrift_upgrades');
      return saved
        ? JSON.parse(saved)
        : { engineLevel: 0, bladeLevel: 0, saltLevel: 0, boostLevel: 0 };
    } catch {
      return { engineLevel: 0, bladeLevel: 0, saltLevel: 0, boostLevel: 0 };
    }
  });

  // City Contracts & Municipal Work Orders
  const [activeContractId, setActiveContractId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('snowdrift_contract');
      return saved || 'pine-hollow';
    } catch {
      return 'pine-hollow';
    }
  });

  const [completedContracts, setCompletedContracts] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('snowdrift_completed_contracts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [porchesDone, setPorchesDone] = useState<number>(0);
  const [roofsDone, setRoofsDone] = useState<number>(0);

  // Control Mode & On-Foot Interactions
  const [controlMode, setControlMode] = useState<'vehicle' | 'foot'>('vehicle');
  const [isNearVehicle, setIsNearVehicle] = useState<boolean>(true);
  const [nearWorkOrderPrompt, setNearWorkOrderPrompt] = useState<string | null>(null);

  // Run stats
  const [clearancePct, setClearancePct] = useState<number>(0);
  const [speedKmH, setSpeedKmH] = useState<number>(0);
  const [boostCharge, setBoostCharge] = useState<number>(1.0);
  const [saltRemaining, setSaltRemaining] = useState<number>(1.0);
  const [score, setScore] = useState<number>(0);
  const [runCoinsEarned, setRunCoinsEarned] = useState<number>(0);
  const [maxComboReached, setMaxComboReached] = useState<number>(1.0);

  // Combo system state
  const [comboCount, setComboCount] = useState<number>(0);
  const [comboDecayProgress, setComboDecayProgress] = useState<number>(1.0);
  const comboLastPlowTimeRef = useRef<number>(0);
  const comboCountRef = useRef<number>(0);

  // Notification toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  // Dynamic Weather & Municipal Violation Alerts
  const [currentWeather, setCurrentWeather] = useState<WeatherConfig>(WEATHER_CONFIGS.flurry);
  const [municipalFineAlert, setMunicipalFineAlert] = useState<{ amount: number; reason: string } | null>(null);
  const fineAlertTimeoutRef = useRef<number | null>(null);
  const [checkpointWarning, setCheckpointWarning] = useState<string | null>(null);
  const checkpointTimeoutRef = useRef<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToastMessage(null), 3500);
  };

  useEffect(() => {
    document.body.dataset.state = gameState;
  }, [gameState]);

  useEffect(() => {
    try {
      localStorage.setItem('snowdrift_coins', coins.toString());
      localStorage.setItem('snowdrift_unlocked', JSON.stringify(unlockedVehicles));
      localStorage.setItem('snowdrift_equipped', equippedVehicleId);
      localStorage.setItem('snowdrift_upgrades', JSON.stringify(upgrades));
      localStorage.setItem('snowdrift_contract', activeContractId);
      localStorage.setItem('snowdrift_completed_contracts', JSON.stringify(completedContracts));
    } catch {
      // ignore
    }
  }, [coins, unlockedVehicles, equippedVehicleId, upgrades, activeContractId, completedContracts]);

  useEffect(() => {
    if (!containerRef.current) return;

    const world = new SnowGameWorld(containerRef.current, {
      onSnowPlowed: (volume) => {
        comboCountRef.current += Math.max(1, Math.round(volume * 1.5));
        comboLastPlowTimeRef.current = performance.now();
        setComboCount(comboCountRef.current);
        setComboDecayProgress(1.0);

        const currentMult = getComboMultiplier(comboCountRef.current);
        if (currentMult > 1.0 && comboCountRef.current % 15 === 0) {
          sound.playComboJingle(currentMult);
        }

        const yieldData = calculatePlowYield(volume, comboCountRef.current);
        setCoins((prev) => prev + yieldData.coins);
        setRunCoinsEarned((prev) => prev + yieldData.coins);
        setScore((prev) => prev + yieldData.score);
        setMaxComboReached((prev) => Math.max(prev, currentMult));
      },
      onTreasureFound: (type) => {
        let title = '';
        let bonusCoins = 0;
        if (type === 'bell') {
          title = '🔔 Golden Town Bell! +50 Coins!';
          bonusCoins = 50;
        } else if (type === 'cocoa') {
          title = '☕ Hot Cocoa! Boost Refilled & +30 Coins!';
          bonusCoins = 30;
          if (worldRef.current) worldRef.current.boostCharge = 1.0;
        } else if (type === 'mittens') {
          title = '🧤 Cozy Woolen Mittens! +25 Coins!';
          bonusCoins = 25;
        } else {
          title = '🪵 Dry Hearth Firewood! +20 Coins!';
          bonusCoins = 20;
        }
        showToast(title);
        setCoins((prev) => prev + bonusCoins);
        setRunCoinsEarned((prev) => prev + bonusCoins);
      },
      onPorchShoveled: (idx) => {
        setPorchesDone((prev) => prev + 1);
        setCoins((prev) => prev + 15);
        setRunCoinsEarned((prev) => prev + 15);
        showToast(`🏡 Cabin #${idx + 1} Porch Shoveled! +15 Coins!`);
      },
      onRoofRaked: (idx) => {
        setRoofsDone((prev) => prev + 1);
        setCoins((prev) => prev + 35);
        setRunCoinsEarned((prev) => prev + 35);
        showToast(`❄ Cabin #${idx + 1} Roof Snow Raked! +35 Coins!`);
      },
      onCrash: () => {
        // Crash into building penalty: resets combo
        if (comboCountRef.current > 0) {
          comboCountRef.current = 0;
          setComboCount(0);
          showToast('💥 Crashed into building! Combo reset!');
        }
      },
      onMunicipalFine: (amount, reason) => {
        setCoins((prev) => {
          const res = applyMunicipalFine(prev, amount);
          return res.newCoins;
        });
        if (comboCountRef.current > 0) {
          comboCountRef.current = 0;
          setComboCount(0);
        }
        setMunicipalFineAlert({ amount, reason });
        if (fineAlertTimeoutRef.current) clearTimeout(fineAlertTimeoutRef.current);
        fineAlertTimeoutRef.current = window.setTimeout(() => setMunicipalFineAlert(null), 4200);
      },
      onWeatherChange: (_stage, config) => {
        setCurrentWeather(config);
        if (config.isBlizzardAlert) {
          showToast('⚠️ BLIZZARD WARNING! Rapid Snow Re-Accumulating on Roads!');
        }
      },
      onCheckpointWarning: (msg) => {
        setCheckpointWarning(msg);
        if (checkpointTimeoutRef.current) clearTimeout(checkpointTimeoutRef.current);
        checkpointTimeoutRef.current = window.setTimeout(() => setCheckpointWarning(null), 4000);
      },
      onClearanceUpdate: (pct) => {
        setClearancePct(pct);
        if (pct >= 95 && gameState === 'playing') {
          setGameState('gameover');
        }
      },
      onSpeedUpdate: (spd) => {
        setSpeedKmH(spd);
      },
      onBoostUpdate: (b) => {
        setBoostCharge(b);
      },
      onSaltRemainingUpdate: (s) => {
        setSaltRemaining(s);
      },
      onModeChange: (mode) => {
        setControlMode(mode);
      },
      onNearVehicleChange: (near) => {
        setIsNearVehicle(near);
      },
      onNearWorkOrderChange: (prompt) => {
        setNearWorkOrderPrompt(prompt);
      },
    });

    worldRef.current = world;
    world.upgrades = upgrades;
    world.buildVehicle(equippedVehicleId);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('autostart') === '1') {
      world.setPlayingMode();
      setGameState('playing');
    }

    return () => {
      world.dispose();
      worldRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (worldRef.current) {
      worldRef.current.upgrades = upgrades;
      worldRef.current.buildVehicle(equippedVehicleId);
    }
  }, [equippedVehicleId, upgrades]);

  useEffect(() => {
    const COMBO_TIMEOUT_MS = 3500;
    const interval = window.setInterval(() => {
      if (comboCountRef.current > 0) {
        const elapsed = performance.now() - comboLastPlowTimeRef.current;
        const progress = Math.max(0, 1 - elapsed / COMBO_TIMEOUT_MS);
        setComboDecayProgress(progress);
        if (progress <= 0) {
          comboCountRef.current = 0;
          setComboCount(0);
          setComboDecayProgress(0);
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      if (gameState === 'title') {
        if (key === 'enter' || key === ' ') {
          e.preventDefault();
          startGame();
          return;
        }
      }

      if (key === 'escape' || key === 'p') {
        e.preventDefault();
        if (gameState === 'playing') {
          if (isGarageOpen) setIsGarageOpen(false);
          else if (isContractsOpen) setIsContractsOpen(false);
          else setGameState('paused');
        } else if (gameState === 'paused') {
          setGameState('playing');
        }
        return;
      }

      // Exit / Enter Truck Hotkey [F]
      if (key === 'f') {
        e.preventDefault();
        if (worldRef.current) {
          worldRef.current.toggleVehicleMode();
        }
        return;
      }

      // Contracts Board Hotkey [O]
      if (key === 'o') {
        e.preventDefault();
        setIsContractsOpen((prev) => !prev);
        return;
      }

      // Garage hotkey [G]
      if (key === 'g') {
        e.preventDefault();
        setIsGarageOpen((prev) => !prev);
        return;
      }

      // Mute hotkey [M]
      if (key === 'm') {
        e.preventDefault();
        sound.toggleMute();
        return;
      }

      // Controls
      if (gameState === 'playing' && worldRef.current) {
        if (key === 'w' || key === 'arrowup') worldRef.current.inputs.forward = true;
        if (key === 's' || key === 'arrowdown') worldRef.current.inputs.backward = true;
        if (key === 'a' || key === 'arrowleft') worldRef.current.inputs.left = true;
        if (key === 'd' || key === 'arrowright') worldRef.current.inputs.right = true;

        if (key === ' ') {
          e.preventDefault();
          if (controlMode === 'vehicle') {
            worldRef.current.inputs.boost = true;
          } else {
            // On foot: Shovel / Rake action!
            worldRef.current.inputs.action = true;
          }
        }
        if (key === 'e') {
          e.preventDefault();
          worldRef.current.inputs.salt = true;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (worldRef.current) {
        if (key === 'w' || key === 'arrowup') worldRef.current.inputs.forward = false;
        if (key === 's' || key === 'arrowdown') worldRef.current.inputs.backward = false;
        if (key === 'a' || key === 'arrowleft') worldRef.current.inputs.left = false;
        if (key === 'd' || key === 'arrowright') worldRef.current.inputs.right = false;
        if (key === ' ') {
          worldRef.current.inputs.boost = false;
          worldRef.current.inputs.action = false;
        }
        if (key === 'e') worldRef.current.inputs.salt = false;
      }
    };

    const handleBlur = () => {
      if (worldRef.current) {
        worldRef.current.inputs = {
          forward: false,
          backward: false,
          left: false,
          right: false,
          boost: false,
          salt: false,
          action: false,
        };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [gameState, isGarageOpen, isContractsOpen, controlMode]);

  const handleMobileInput = (action: string, isPressed: boolean) => {
    if (!worldRef.current) return;
    if (action === 'forward') worldRef.current.inputs.forward = isPressed;
    if (action === 'backward') worldRef.current.inputs.backward = isPressed;
    if (action === 'left') worldRef.current.inputs.left = isPressed;
    if (action === 'right') worldRef.current.inputs.right = isPressed;
    if (action === 'boost') worldRef.current.inputs.boost = isPressed;
    if (action === 'salt') worldRef.current.inputs.salt = isPressed;
    if (action === 'action') worldRef.current.inputs.action = isPressed;
  };

  const startGame = () => {
    if (worldRef.current) {
      worldRef.current.setPlayingMode();
    }
    setGameState('playing');
  };

  const handleRestart = () => {
    if (worldRef.current) {
      worldRef.current.resetPosition();
      worldRef.current.setPlayingMode();
    }
    setClearancePct(0);
    setScore(0);
    setRunCoinsEarned(0);
    setPorchesDone(0);
    setRoofsDone(0);
    setMaxComboReached(1.0);
    comboCountRef.current = 0;
    setComboCount(0);
    setGameState('playing');
  };

  const handleReturnToTitle = () => {
    if (worldRef.current) {
      worldRef.current.setTitleMode();
    }
    setGameState('title');
  };

  const handleSelectVehicle = (id: string) => {
    setEquippedVehicleId(id);
    if (worldRef.current) {
      worldRef.current.buildVehicle(id);
    }
  };

  const handleUnlockVehicle = (id: string, cost: number) => {
    if (coins >= cost && !unlockedVehicles.includes(id)) {
      setCoins((prev) => prev - cost);
      setUnlockedVehicles((prev) => [...prev, id]);
      setEquippedVehicleId(id);
      if (worldRef.current) {
        worldRef.current.buildVehicle(id);
      }
    }
  };

  const handleUpgradePart = (part: keyof VehicleUpgradeLevels, cost: number) => {
    if (coins >= cost && upgrades[part] < 3) {
      setCoins((prev) => prev - cost);
      setUpgrades((prev) => {
        const next = { ...prev, [part]: prev[part] + 1 };
        if (worldRef.current) {
          worldRef.current.upgrades = next;
          worldRef.current.buildVehicle(equippedVehicleId);
        }
        return next;
      });
    }
  };

  const handleClaimContract = (contract: CityContract, reward: number) => {
    setCoins((prev) => prev + reward);
    setRunCoinsEarned((prev) => prev + reward);
    setCompletedContracts((prev) => [...prev, contract.id]);
    showToast(`🏆 ${contract.cityName} Contract Completed! +${reward} Coins Declared!`);
    setIsContractsOpen(false);
  };

  const activeContract =
    CITY_CONTRACTS.find((c) => c.id === activeContractId) || CITY_CONTRACTS[0];
  const currentVehicleConfig =
    VEHICLE_CATALOG.find((v) => v.id === equippedVehicleId) || VEHICLE_CATALOG[0];
  const comboMultiplier = getComboMultiplier(comboCount);
  const comboTitle = getComboTitle(comboMultiplier);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#141d2b]">
      <div
        ref={containerRef}
        data-testid="three-canvas-mount"
        className="absolute inset-0 w-full h-full"
      />

      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 px-5 py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-bold text-sm shadow-2xl border border-amber-300 flex items-center gap-2 pointer-events-none font-['Fredoka'] animate-bounce-subtle">
          <span>{toastMessage}</span>
        </div>
      )}

      {gameState === 'title' && (
        <TitleScreen
          onStart={startGame}
          onOpenGarage={() => setIsGarageOpen(true)}
          coins={coins}
          equippedVehicleName={currentVehicleConfig.name}
        />
      )}

      {gameState === 'playing' && (
        <HudOverlay
          clearancePct={clearancePct}
          coins={coins}
          comboCount={comboCount}
          comboMultiplier={comboMultiplier}
          comboTitle={comboTitle}
          comboDecayProgress={comboDecayProgress}
          speedKmH={speedKmH}
          boostCharge={boostCharge}
          saltRemaining={saltRemaining}
          vehicleName={currentVehicleConfig.name}
          controlMode={controlMode}
          nearVehicle={isNearVehicle}
          nearWorkOrderPrompt={nearWorkOrderPrompt}
          activeCityName={activeContract.cityName}
          porchesDone={porchesDone}
          porchesTarget={activeContract.requiredPorches}
          roofsDone={roofsDone}
          roofsTarget={activeContract.requiredRoofs}
          weatherConfig={currentWeather}
          municipalFineAlert={municipalFineAlert}
          checkpointWarning={checkpointWarning}
          onOpenGarage={() => setIsGarageOpen(true)}
          onOpenContracts={() => setIsContractsOpen(true)}
          onToggleVehicleMode={() => worldRef.current?.toggleVehicleMode()}
          onPause={() => setGameState('paused')}
          onMobileInput={handleMobileInput}
        />
      )}

      {gameState === 'paused' && (
        <PauseModal
          onResume={() => setGameState('playing')}
          onRestart={handleRestart}
          onOpenGarage={() => setIsGarageOpen(true)}
          onBackToTitle={handleReturnToTitle}
        />
      )}

      {gameState === 'gameover' && (
        <VictoryModal
          clearancePct={clearancePct}
          totalScore={score}
          coinsEarned={runCoinsEarned}
          maxCombo={maxComboReached}
          onPlayAgain={handleRestart}
          onOpenGarage={() => setIsGarageOpen(true)}
        />
      )}

      {/* Vehicle Garage Modal */}
      {isGarageOpen && (
        <GarageModal
          coins={coins}
          unlockedVehicles={unlockedVehicles}
          equippedVehicleId={equippedVehicleId}
          upgrades={upgrades}
          onSelectVehicle={handleSelectVehicle}
          onUnlockVehicle={handleUnlockVehicle}
          onUpgradePart={handleUpgradePart}
          onClose={() => setIsGarageOpen(false)}
        />
      )}

      {/* City Contracts & Dealership Board Modal */}
      {isContractsOpen && (
        <CityContractsModal
          coins={coins}
          activeContractId={activeContractId}
          progress={{
            clearancePct,
            porchesShoveled: porchesDone,
            roofsRaked: roofsDone,
            maxCombo: maxComboReached,
          }}
          completedContracts={completedContracts}
          onSelectContract={(id) => setActiveContractId(id)}
          onClaimContract={handleClaimContract}
          onClose={() => setIsContractsOpen(false)}
        />
      )}
    </div>
  );
}
