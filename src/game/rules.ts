export interface VehicleStats {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  price: number;
  unlockedByDefault: boolean;
  baseSpeed: number;
  acceleration: number;
  turnRate: number;
  bladeWidth: number;
  saltRadius: number;
  saltCapacity: number;
  color: string;
  accentColor: string;
  bladeColor: string;
  unlockRequirementText?: string;
}

export interface VehicleUpgradeLevels {
  engineLevel: number;
  bladeLevel: number;
  saltLevel: number;
  boostLevel: number;
}

export const VEHICLE_CATALOG: VehicleStats[] = [
  {
    id: 'cub-cadet',
    name: 'Cub Cadet 4x4',
    subtitle: 'Light Town Utility',
    description: 'Nimble & lightweight pickup plow. Excellent turning agility for tight driveways.',
    price: 0,
    unlockedByDefault: true,
    baseSpeed: 16.0,
    acceleration: 22.0,
    turnRate: 3.2,
    bladeWidth: 2.2,
    saltRadius: 2.5,
    saltCapacity: 100,
    color: '#f97316',
    accentColor: '#1e293b',
    bladeColor: '#cbd5e1',
  },
  {
    id: 'alpine-bison',
    name: 'Alpine Bison HD',
    subtitle: 'Heavy Diesel Workhorse',
    description: 'Commercial steel V-plow with high engine torque. Slices through deep drifts effortlessly.',
    price: 250,
    unlockedByDefault: false,
    baseSpeed: 18.5,
    acceleration: 24.0,
    turnRate: 2.7,
    bladeWidth: 3.2,
    saltRadius: 3.8,
    saltCapacity: 200,
    color: '#0284c7',
    accentColor: '#facc15',
    bladeColor: '#94a3b8',
    unlockRequirementText: 'Earn 250 Snow Coins',
  },
  {
    id: 'nordic-mammoth',
    name: 'Nordic Mammoth',
    subtitle: 'Dual-Wing Highway Beast',
    description: 'Equipped with hydraulic wing extenders and twin rear salt spinners. Massive clearing swath.',
    price: 650,
    unlockedByDefault: false,
    baseSpeed: 17.0,
    acceleration: 20.0,
    turnRate: 2.2,
    bladeWidth: 4.4,
    saltRadius: 5.2,
    saltCapacity: 350,
    color: '#dc2626',
    accentColor: '#fbbf24',
    bladeColor: '#475569',
    unlockRequirementText: 'Earn 650 Snow Coins',
  },
  {
    id: 'frost-cat-turbo',
    name: 'Frost-Cat Turbo',
    subtitle: 'High-Velocity Auger Jet',
    description: 'Rotary snow auger and turbo-boosted heated exhaust. Highest speed and rapid snow ejection.',
    price: 1200,
    unlockedByDefault: false,
    baseSpeed: 23.0,
    acceleration: 30.0,
    turnRate: 3.0,
    bladeWidth: 3.6,
    saltRadius: 4.5,
    saltCapacity: 280,
    color: '#10b981',
    accentColor: '#38bdf8',
    bladeColor: '#f8fafc',
    unlockRequirementText: 'Earn 1,200 Snow Coins',
  },
];

export function calculateEffectiveStats(
  base: VehicleStats,
  upgrades: VehicleUpgradeLevels
) {
  const speedBonus = 1 + upgrades.engineLevel * 0.12;
  const widthBonus = 1 + upgrades.bladeLevel * 0.15;
  const saltBonus = 1 + upgrades.saltLevel * 0.20;
  const boostDuration = 2.5 + upgrades.boostLevel * 0.8;

  return {
    maxSpeed: base.baseSpeed * speedBonus,
    acceleration: base.acceleration * speedBonus,
    turnRate: base.turnRate,
    bladeWidth: base.bladeWidth * widthBonus,
    saltRadius: base.saltRadius * saltBonus,
    saltCapacity: Math.round(base.saltCapacity * saltBonus),
    boostDuration,
  };
}

export function getComboMultiplier(comboCount: number): number {
  if (comboCount >= 180) return 5.0;
  if (comboCount >= 120) return 4.0;
  if (comboCount >= 80) return 3.0;
  if (comboCount >= 50) return 2.5;
  if (comboCount >= 25) return 2.0;
  if (comboCount >= 10) return 1.5;
  return 1.0;
}

export function getComboTitle(multiplier: number): string {
  if (multiplier >= 5.0) return 'BLIZZARD STREAK!';
  if (multiplier >= 4.0) return 'AVALANCHE POWER!';
  if (multiplier >= 3.0) return 'FROST FLURRY!';
  if (multiplier >= 2.5) return 'CHILL CRUSHER!';
  if (multiplier >= 2.0) return 'SNOW SWEEPER!';
  if (multiplier >= 1.5) return 'NICE MOMENTUM!';
  return 'PLOWING';
}

export function calculatePlowYield(
  snowAmountCleared: number,
  comboCount: number
): { coins: number; score: number } {
  if (snowAmountCleared <= 0) return { coins: 0, score: 0 };
  const multiplier = getComboMultiplier(comboCount);
  const baseCoins = snowAmountCleared * 1.0;
  const coins = Math.max(1, Math.round(baseCoins * multiplier));
  const score = Math.round(snowAmountCleared * 10 * multiplier);
  return { coins, score };
}

export function getUpgradeCost(level: number): number {
  if (level === 0) return 50;
  if (level === 1) return 120;
  if (level === 2) return 250;
  return Infinity;
}

export function canUnlockVehicle(
  vehicle: VehicleStats,
  currentCoins: number,
  unlockedList: string[]
): boolean {
  if (unlockedList.includes(vehicle.id)) return false;
  return currentCoins >= vehicle.price;
}

export function calculateClearanceStars(clearedPercent: number): number {
  if (clearedPercent >= 95) return 3;
  if (clearedPercent >= 75) return 2;
  if (clearedPercent >= 50) return 1;
  return 0;
}

// ==========================================
// 1. Solid Obstacle Collision System
// ==========================================

export interface ObstacleBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ObstacleCircle {
  x: number;
  z: number;
  radius: number;
}

/**
 * Resolves circle-to-box collision (used for vehicle & character vs houses/cabins).
 * Returns corrected {x, z, collided} pushed safely out of the obstacle.
 */
export function resolveCircleBoxCollision(
  cx: number,
  cz: number,
  radius: number,
  box: ObstacleBox
): { x: number; z: number; collided: boolean } {
  const closestX = Math.max(box.minX, Math.min(cx, box.maxX));
  const closestZ = Math.max(box.minZ, Math.min(cz, box.maxZ));

  const distX = cx - closestX;
  const distZ = cz - closestZ;
  const distSq = distX * distX + distZ * distZ;

  if (distSq < radius * radius && distSq > 0.00001) {
    const dist = Math.sqrt(distSq);
    const overlap = radius - dist;
    const nx = distX / dist;
    const nz = distZ / dist;
    return {
      x: cx + nx * overlap,
      z: cz + nz * overlap,
      collided: true,
    };
  }

  // Inside box completely (deep penetration recovery)
  if (cx >= box.minX && cx <= box.maxX && cz >= box.minZ && cz <= box.maxZ) {
    const toMinX = cx - box.minX;
    const toMaxX = box.maxX - cx;
    const toMinZ = cz - box.minZ;
    const toMaxZ = box.maxZ - cz;
    const minPush = Math.min(toMinX, toMaxX, toMinZ, toMaxZ);

    if (minPush === toMinX) return { x: box.minX - radius, z: cz, collided: true };
    if (minPush === toMaxX) return { x: box.maxX + radius, z: cz, collided: true };
    if (minPush === toMinZ) return { x: cx, z: box.minZ - radius, collided: true };
    return { x: cx, z: box.maxZ + radius, collided: true };
  }

  return { x: cx, z: cz, collided: false };
}

/**
 * Resolves circle-to-circle collision (used for trees, lamp posts, snowmen).
 */
export function resolveCircleCircleCollision(
  cx: number,
  cz: number,
  entityRadius: number,
  obs: ObstacleCircle
): { x: number; z: number; collided: boolean } {
  const dx = cx - obs.x;
  const dz = cz - obs.z;
  const distSq = dx * dx + dz * dz;
  const minDist = entityRadius + obs.radius;

  if (distSq < minDist * minDist && distSq > 0.00001) {
    const dist = Math.sqrt(distSq);
    const overlap = minDist - dist;
    return {
      x: cx + (dx / dist) * overlap,
      z: cz + (dz / dist) * overlap,
      collided: true,
    };
  }
  return { x: cx, z: cz, collided: false };
}

// ==========================================
// 2. City Work Orders & Dealership Dashboard
// ==========================================

export interface CityContract {
  id: string;
  cityName: string;
  tier: string;
  dealershipName: string;
  description: string;
  sizeCategory: 'Small' | 'Medium' | 'Large';
  basePayout: number;
  requiredClearancePct: number;
  requiredPorches: number;
  requiredRoofs: number;
  requiredComboTier: number; // e.g. 1.5, 2.0, 3.0
  bonusMultiplier: number;
}

export const CITY_CONTRACTS: CityContract[] = [
  {
    id: 'pine-hollow',
    cityName: 'Pine Hollow Hamlet',
    tier: 'Township Municipal Dealership',
    dealershipName: 'Alpine Valley Works',
    description: 'A cozy starter mountain hamlet. Clear the central avenues and shovel cabin porches.',
    sizeCategory: 'Small',
    basePayout: 250,
    requiredClearancePct: 50,
    requiredPorches: 3,
    requiredRoofs: 2,
    requiredComboTier: 1.5,
    bonusMultiplier: 1.0,
  },
  {
    id: 'frostpeak-pass',
    cityName: 'Frostpeak Mountain Pass',
    tier: 'Regional Highway Dealership',
    dealershipName: 'Highline Snow Fleet',
    description: 'Challenging high-elevation suburban pass with steep chalet roofs and icy bridge roads.',
    sizeCategory: 'Medium',
    basePayout: 650,
    requiredClearancePct: 75,
    requiredPorches: 5,
    requiredRoofs: 4,
    requiredComboTier: 2.5,
    bonusMultiplier: 1.25,
  },
  {
    id: 'glacier-metropolis',
    cityName: 'Grand Glacier Resort City',
    tier: 'Premier Winter Dealership',
    dealershipName: 'Glacier Crown Logistics',
    description: 'Premier world-class winter resort. Demands spotless roads, safe porches, and cleared chalet roofs!',
    sizeCategory: 'Large',
    basePayout: 1500,
    requiredClearancePct: 90,
    requiredPorches: 8,
    requiredRoofs: 6,
    requiredComboTier: 3.5,
    bonusMultiplier: 1.5,
  },
];

export interface ContractProgress {
  clearancePct: number;
  porchesShoveled: number;
  roofsRaked: number;
  maxCombo: number;
}

export function isContractCompleted(
  contract: CityContract,
  progress: ContractProgress
): boolean {
  return (
    progress.clearancePct >= contract.requiredClearancePct &&
    progress.porchesShoveled >= contract.requiredPorches &&
    progress.roofsRaked >= contract.requiredRoofs &&
    progress.maxCombo >= contract.requiredComboTier
  );
}

export function calculateContractTotalReward(
  contract: CityContract,
  progress: ContractProgress
): number {
  const base = contract.basePayout;
  const extraClearance = Math.max(0, progress.clearancePct - contract.requiredClearancePct);
  const bonus = Math.round(extraClearance * 10 * contract.bonusMultiplier);
  return base + bonus;
}

// ==========================================
// 3. Dynamic Snowfall & Weather Intensity System
// ==========================================

export type WeatherStage = 'flurry' | 'steady' | 'blizzard' | 'clear';

export interface WeatherConfig {
  id: WeatherStage;
  name: string;
  icon: string;
  description: string;
  fogNear: number;
  fogFar: number;
  fogColor: number; // Hex color for Three.js fog & background
  ambientIntensity: number;
  sunIntensity: number;
  snowParticlesSpeed: number;
  windSpeedKmH: number;
  windAngleRad: number;
  accumulationRatePerSec: number; // cells per sec to re-accumulate on plowed roads
  visibilityMeters: number;
  temperatureC: number;
  snowfallCmPerHour: number;
  durationSeconds: number;
  isBlizzardAlert: boolean;
}

export const WEATHER_CONFIGS: Record<WeatherStage, WeatherConfig> = {
  flurry: {
    id: 'flurry',
    name: 'Gentle Flurries',
    icon: '🌨️',
    description: 'Light crystalline flakes drifting gently across roofs and roads.',
    fogNear: 25,
    fogFar: 95,
    fogColor: 0x94a3b8,
    ambientIntensity: 0.95,
    sunIntensity: 1.1,
    snowParticlesSpeed: 14.0,
    windSpeedKmH: 12,
    windAngleRad: 0.2,
    accumulationRatePerSec: 0.2,
    visibilityMeters: 450,
    temperatureC: -4,
    snowfallCmPerHour: 0.8,
    durationSeconds: 40,
    isBlizzardAlert: false,
  },
  steady: {
    id: 'steady',
    name: 'Steady Snowfall',
    icon: '❄️',
    description: 'Crisp winter snow accumulating steadily over cleared avenues.',
    fogNear: 18,
    fogFar: 68,
    fogColor: 0x64748b,
    ambientIntensity: 0.75,
    sunIntensity: 0.85,
    snowParticlesSpeed: 22.0,
    windSpeedKmH: 26,
    windAngleRad: 0.55,
    accumulationRatePerSec: 1.5,
    visibilityMeters: 180,
    temperatureC: -8,
    snowfallCmPerHour: 3.2,
    durationSeconds: 50,
    isBlizzardAlert: false,
  },
  blizzard: {
    id: 'blizzard',
    name: 'Whiteout Blizzard',
    icon: '⚠️ 🌪️',
    description: 'Severe gale-force squall! Rapid snow drift re-accumulation and dense whiteout fog.',
    fogNear: 8,
    fogFar: 36,
    fogColor: 0xdbeafe,
    ambientIntensity: 0.55,
    sunIntensity: 0.45,
    snowParticlesSpeed: 38.0,
    windSpeedKmH: 62,
    windAngleRad: 1.1,
    accumulationRatePerSec: 3.8,
    visibilityMeters: 35,
    temperatureC: -18,
    snowfallCmPerHour: 8.5,
    durationSeconds: 35,
    isBlizzardAlert: true,
  },
  clear: {
    id: 'clear',
    name: 'Alps Sunbreak',
    icon: '☀️ 🏔️',
    description: 'Clear blue skies with sparkling snowbanks and crisp mountain air. No new accumulation.',
    fogNear: 35,
    fogFar: 130,
    fogColor: 0xbfdbfe,
    ambientIntensity: 1.25,
    sunIntensity: 1.5,
    snowParticlesSpeed: 7.0,
    windSpeedKmH: 6,
    windAngleRad: 0.1,
    accumulationRatePerSec: 0.0,
    visibilityMeters: 900,
    temperatureC: -1,
    snowfallCmPerHour: 0.0,
    durationSeconds: 45,
    isBlizzardAlert: false,
  },
};

export const WEATHER_CYCLE_ORDER: WeatherStage[] = ['flurry', 'steady', 'blizzard', 'clear'];

export function getNextWeatherStage(current: WeatherStage): WeatherStage {
  const idx = WEATHER_CYCLE_ORDER.indexOf(current);
  if (idx === -1) return 'flurry';
  return WEATHER_CYCLE_ORDER[(idx + 1) % WEATHER_CYCLE_ORDER.length];
}

export function calculateSnowAccumulationCount(
  ratePerSec: number,
  deltaSec: number,
  accumulator: number
): { cellsToAdd: number; newAccumulator: number } {
  const total = accumulator + ratePerSec * deltaSec;
  const cellsToAdd = Math.floor(total);
  const newAccumulator = total - cellsToAdd;
  return { cellsToAdd, newAccumulator };
}

// ==========================================
// 4. Municipal Safety Violations & Fines (MCPs)
// ==========================================

export interface MunicipalFineRule {
  type: 'pedestrian' | 'lamp' | 'speeding';
  fineAmount: number;
  reason: string;
  resetsCombo: boolean;
}

export const MUNICIPAL_FINES: Record<'pedestrian' | 'lamp' | 'speeding', MunicipalFineRule> = {
  pedestrian: {
    type: 'pedestrian',
    fineAmount: 100,
    reason: 'CITIZEN ENDANGERMENT: Collision with town resident on foot!',
    resetsCombo: true,
  },
  lamp: {
    type: 'lamp',
    fineAmount: 25,
    reason: 'MUNICIPAL DAMAGE: Collision with town light post or property!',
    resetsCombo: true,
  },
  speeding: {
    type: 'speeding',
    fineAmount: 40,
    reason: 'BLIZZARD SPEED VIOLATION: Excessive velocity during whiteout!',
    resetsCombo: false,
  },
};

export function applyMunicipalFine(
  currentCoins: number,
  fineAmount: number
): { newCoins: number; fineAssessed: number } {
  // Fine is deducted from current coins or contract earnings, with a floor of 0
  const fineAssessed = Math.min(currentCoins, fineAmount);
  const newCoins = Math.max(0, currentCoins - fineAmount);
  return { newCoins, fineAssessed };
}

// ==========================================
// 5. Realistic Highway Entry & Exit Checkpoints
// ==========================================

export interface HighwayCheckpoint {
  id: string;
  name: string;
  x: number;
  z: number;
  heading: number; // Direction facing into city
  warningText: string;
  gateWidth: number;
}

export const HIGHWAY_CHECKPOINTS: HighwayCheckpoint[] = [
  {
    id: 'north-pass',
    name: 'Highway 9 North Mountain Pass',
    x: 0,
    z: -56,
    heading: 0, // Faces south into town
    warningText: 'PASS CLOSED: Severe avalanche danger beyond municipal perimeter. Return to city district!',
    gateWidth: 14,
  },
  {
    id: 'south-exit',
    name: 'Valley Expressway South Exit',
    x: 0,
    z: 56,
    heading: Math.PI, // Faces north into town
    warningText: 'TOLL EXIT ONLY: Regional contract zone ends here. Maintain plow coverage within city limits!',
    gateWidth: 14,
  },
];

export function checkHighwayCheckpointWarning(
  x: number,
  z: number,
  warningThresholdDistance: number = 7.5
): HighwayCheckpoint | null {
  for (const cp of HIGHWAY_CHECKPOINTS) {
    const dist = Math.hypot(x - cp.x, z - cp.z);
    if (dist <= warningThresholdDistance) {
      return cp;
    }
  }
  return null;
}

