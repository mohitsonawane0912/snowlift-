import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VEHICLE_CATALOG,
  calculateEffectiveStats,
  getComboMultiplier,
  getComboTitle,
  calculatePlowYield,
  getUpgradeCost,
  canUnlockVehicle,
  calculateClearanceStars,
  resolveCircleBoxCollision,
  resolveCircleCircleCollision,
  CITY_CONTRACTS,
  isContractCompleted,
  calculateContractTotalReward,
  getNextWeatherStage,
  calculateSnowAccumulationCount,
  WEATHER_CONFIGS,
  applyMunicipalFine,
  MUNICIPAL_FINES,
  checkHighwayCheckpointWarning,
} from './rules.ts';

test('Vehicle catalog has 4 distinct vehicles with starter unlocked', () => {
  assert.equal(VEHICLE_CATALOG.length, 4);
  const starter = VEHICLE_CATALOG.find((v) => v.id === 'cub-cadet');
  assert.ok(starter);
  assert.equal(starter.unlockedByDefault, true);
  assert.equal(starter.price, 0);

  const bison = VEHICLE_CATALOG.find((v) => v.id === 'alpine-bison');
  assert.ok(bison);
  assert.equal(bison.unlockedByDefault, false);
  assert.ok(bison.price > 0);
  assert.ok(bison.bladeWidth > starter.bladeWidth);
});

test('calculateEffectiveStats scales stats properly with upgrade levels', () => {
  const base = VEHICLE_CATALOG[0];
  const zeroUpgrades = {
    engineLevel: 0,
    bladeLevel: 0,
    saltLevel: 0,
    boostLevel: 0,
  };
  const stats0 = calculateEffectiveStats(base, zeroUpgrades);
  assert.equal(stats0.maxSpeed, base.baseSpeed);
  assert.equal(stats0.bladeWidth, base.bladeWidth);

  const upgraded = {
    engineLevel: 2,
    bladeLevel: 2,
    saltLevel: 1,
    boostLevel: 1,
  };
  const statsUp = calculateEffectiveStats(base, upgraded);
  assert.ok(statsUp.maxSpeed > base.baseSpeed);
  assert.ok(statsUp.bladeWidth > base.bladeWidth);
  assert.ok(statsUp.saltCapacity > base.saltCapacity);
});

test('Combo multiplier steps correctly from 1.0x to 5.0x', () => {
  assert.equal(getComboMultiplier(0), 1.0);
  assert.equal(getComboMultiplier(9), 1.0);
  assert.equal(getComboMultiplier(10), 1.5);
  assert.equal(getComboMultiplier(25), 2.0);
  assert.equal(getComboMultiplier(50), 2.5);
  assert.equal(getComboMultiplier(80), 3.0);
  assert.equal(getComboMultiplier(120), 4.0);
  assert.equal(getComboMultiplier(180), 5.0);

  assert.equal(getComboTitle(5.0), 'BLIZZARD STREAK!');
});

test('calculatePlowYield applies combo multiplier to score and coins', () => {
  const yield1 = calculatePlowYield(1, 0);
  assert.equal(yield1.coins, 1);
  assert.equal(yield1.score, 10);

  const yield5 = calculatePlowYield(2, 200);
  assert.equal(yield5.coins, 10);
  assert.equal(yield5.score, 100);
});

test('getUpgradeCost returns tiered prices and Infinity at max', () => {
  assert.equal(getUpgradeCost(0), 50);
  assert.equal(getUpgradeCost(1), 120);
  assert.equal(getUpgradeCost(2), 250);
  assert.equal(getUpgradeCost(3), Infinity);
});

test('canUnlockVehicle validates balance and ownership', () => {
  const bison = VEHICLE_CATALOG.find((v) => v.id === 'alpine-bison')!;
  assert.equal(canUnlockVehicle(bison, 100, ['cub-cadet']), false);
  assert.equal(canUnlockVehicle(bison, 300, ['cub-cadet']), true);
  assert.equal(canUnlockVehicle(bison, 500, ['cub-cadet', 'alpine-bison']), false);
});

test('calculateClearanceStars grades percentage accurately', () => {
  assert.equal(calculateClearanceStars(30), 0);
  assert.equal(calculateClearanceStars(52), 1);
  assert.equal(calculateClearanceStars(80), 2);
  assert.equal(calculateClearanceStars(98), 3);
});

test('Solid box collision stops and pushes car out of house', () => {
  // House centered at (0, 0), box width 8, depth 6 (minX: -4, maxX: 4, minZ: -3, maxZ: 3)
  const houseBox = { minX: -4, maxX: 4, minZ: -3, maxZ: 3 };
  const carRadius = 1.4;

  // Car at (0, 3.5), approaching south wall of house at z = 3
  // distance from house edge is 0.5, but car radius is 1.4 -> penetrates!
  const res = resolveCircleBoxCollision(0, 3.5, carRadius, houseBox);
  assert.equal(res.collided, true);
  // Must be pushed back out past z = 3 + 1.4 = 4.4
  assert.ok(res.z >= 4.4 - 0.001);

  // Car safely away at (0, 6)
  const safeRes = resolveCircleBoxCollision(0, 6, carRadius, houseBox);
  assert.equal(safeRes.collided, false);
  assert.equal(safeRes.z, 6);
});

test('Solid circle collision pushes entity away from tree trunk', () => {
  const tree = { x: 10, z: 10, radius: 0.8 };
  const carRadius = 1.4;
  // Car at (10, 11) -> dist is 1.0, sum of radii is 2.2 -> penetrates!
  const res = resolveCircleCircleCollision(10, 11, carRadius, tree);
  assert.equal(res.collided, true);
  assert.ok(res.z >= 12.2 - 0.001);
});

test('City contract work orders completion check and rewards', () => {
  const starter = CITY_CONTRACTS[0];
  assert.equal(starter.sizeCategory, 'Small');
  assert.equal(starter.basePayout, 250);

  const incomplete = {
    clearancePct: 40,
    porchesShoveled: 1,
    roofsRaked: 0,
    maxCombo: 1.0,
  };
  assert.equal(isContractCompleted(starter, incomplete), false);

  const complete = {
    clearancePct: 65,
    porchesShoveled: 3,
    roofsRaked: 2,
    maxCombo: 2.0,
  };
  assert.equal(isContractCompleted(starter, complete), true);
  const reward = calculateContractTotalReward(starter, complete);
  assert.ok(reward > starter.basePayout); // Includes performance bonus
});

test('Weather stage progression cycles seamlessly', () => {
  assert.equal(getNextWeatherStage('flurry'), 'steady');
  assert.equal(getNextWeatherStage('steady'), 'blizzard');
  assert.equal(getNextWeatherStage('blizzard'), 'clear');
  assert.equal(getNextWeatherStage('clear'), 'flurry');

  assert.equal(WEATHER_CONFIGS.blizzard.isBlizzardAlert, true);
  assert.ok(WEATHER_CONFIGS.blizzard.accumulationRatePerSec > WEATHER_CONFIGS.steady.accumulationRatePerSec);
  assert.equal(WEATHER_CONFIGS.clear.accumulationRatePerSec, 0);
});

test('Snow accumulation calculation yields integer cells and stores remainder', () => {
  // At 3.8 cells/sec over 0.5s: 1.9 cells. accumulator 0 -> cellsToAdd: 1, newAccumulator: 0.9
  const step1 = calculateSnowAccumulationCount(3.8, 0.5, 0.0);
  assert.equal(step1.cellsToAdd, 1);
  assert.ok(Math.abs(step1.newAccumulator - 0.9) < 0.0001);

  // Next frame 0.5s: 1.9 + 0.9 = 2.8 -> cellsToAdd: 2, newAccumulator: 0.8
  const step2 = calculateSnowAccumulationCount(3.8, 0.5, step1.newAccumulator);
  assert.equal(step2.cellsToAdd, 2);
  assert.ok(Math.abs(step2.newAccumulator - 0.8) < 0.0001);
});

test('applyMunicipalFine correctly penalizes coins with zero floor', () => {
  const fine = MUNICIPAL_FINES.pedestrian.fineAmount; // 100

  // Sufficient balance:
  const res1 = applyMunicipalFine(250, fine);
  assert.equal(res1.newCoins, 150);
  assert.equal(res1.fineAssessed, 100);

  // Under-balance:
  const res2 = applyMunicipalFine(30, fine);
  assert.equal(res2.newCoins, 0);
  assert.equal(res2.fineAssessed, 30);
});

test('checkHighwayCheckpointWarning detects entry/exit checkpoint threshold', () => {
  // Checkpoint at (0, -56)
  const warn = checkHighwayCheckpointWarning(0, -52, 7.5); // dist = 4 <= 7.5
  assert.ok(warn);
  assert.equal(warn.id, 'north-pass');

  // Outside warning range
  const safe = checkHighwayCheckpointWarning(0, 0, 7.5);
  assert.equal(safe, null);
});

