export const CROP_KEYS = [
  'tomato',
  'carrot',
  'pumpkin',
  'onion',
  'beetroot',
  'cherry',
  'watermelon',
  'eggplant',
];

export const SEASONAL_CROPS = {
  winter: ['pumpkin', 'carrot', 'onion', 'beetroot'],
  summer: ['tomato', 'cherry', 'watermelon', 'eggplant'],
};

export const CROP_EMOJIS = {
  tomato: '🍅',
  carrot: '🥕',
  pumpkin: '🎃',
  onion: '🧅',
  beetroot: '🍠',
  cherry: '🍒',
  watermelon: '🍉',
  eggplant: '🍆',
};

export const CROP_COLORS = {
  tomato: '#d95a5a',
  carrot: '#f6b25a',
  pumpkin: '#f4b95e',
  onion: '#d9c0f0',
  beetroot: '#9d3a53',
  cherry: '#e04d57',
  watermelon: '#57bf7a',
  eggplant: '#8f67d8',
};

// Per-crop economy: tomato and carrot are cheap starters; later crops cost much more to unlock
// and to seed, but sell for far more.
const CROP_ECONOMY = {
  tomato: { price: 11, unlockCost: 0, seedPackCost: 10 },
  carrot: { price: 8, unlockCost: 0, seedPackCost: 10 },
  pumpkin: { price: 20, unlockCost: 250, seedPackCost: 30 },
  beetroot: { price: 22, unlockCost: 400, seedPackCost: 40 },
  onion: { price: 49, unlockCost: 1500, seedPackCost: 100 },
  cherry: { price: 84, unlockCost: 3000, seedPackCost: 150 },
  eggplant: { price: 168, unlockCost: 10000, seedPackCost: 300 },
  watermelon: { price: 280, unlockCost: 20000, seedPackCost: 500 },
};

export const CROP_BASE_PRICES = Object.fromEntries(CROP_KEYS.map((cropKey) => [cropKey, CROP_ECONOMY[cropKey].price]));

export const INITIAL_INVENTORY = {
  tomato: 20,
  carrot: 20,
  pumpkin: 0,
  onion: 0,
  beetroot: 0,
  cherry: 0,
  watermelon: 0,
  eggplant: 0,
};

export const INITIAL_CROP_INVENTORY = Object.fromEntries(CROP_KEYS.map((crop) => [crop, 0]));

// unlockCost: coins to open the market (0 = available from the start; placeholder values until balancing).
// minVariety: how many crop types a trip must put on sale (see MIN_UNITS_FOR_VARIETY).
// A market's customers only buy the crops listed in its MARKET_DEMAND_WEIGHTS entry.
export const MARKET_LOCATIONS = {
  village: { label: 'Village', unlockCost: 0, trafficMin: 50, trafficMax: 100, minVariety: 2 },
  town: { label: 'Town', unlockCost: 2000, trafficMin: 250, trafficMax: 750, minVariety: 3 },
  city: { label: 'City', unlockCost: 25000, trafficMin: 1000, trafficMax: 5000, minVariety: 4 },
};

// A crop counts toward the variety minimum only with at least this many units offered for sale
// (harvest minus what is kept in the barn).
export const MIN_UNITS_FOR_VARIETY = 3;

// Customer demand curve: MARKET_BASE_BUY_RATE of customers buy at the base price;
// MARKET_PRICE_SENSITIVITY controls how quickly that share falls as the price rises.
export const MARKET_BASE_BUY_RATE = 0.7;
export const MARKET_PRICE_SENSITIVITY = 4;

// The price − / + buttons move the price by this share of the crop's base price (at least 1 coin),
// so every crop needs about the same number of clicks.
export const MARKET_PRICE_STEP_SHARE = 0.1;

// The sale plays as a time-compressed market day. Its length (at 1× speed) grows with the customers
// who reach the stall, within these limits; the day closes early once everything is sold out.
export const SALE_DAY_MS_PER_CUSTOMER = 150;
export const SALE_DAY_MIN_MS = 10000;
export const SALE_DAY_MAX_MS = 20000;
export const SALE_DAY_SPEEDS = [1, 2, 4];

// Barn: keep harvested crops for a later market visit instead of selling them now. Kept crops come
// back as harvest next visit, minus BARN_SPOILAGE of each crop (rounded up). Capacity is upgradable.
export const BARN_LEVELS = [
  { capacity: 30, cost: 0 },
  { capacity: 60, cost: 2500 },
  { capacity: 120, cost: 15000 },
];
export const BARN_SPOILAGE = 0.1;
export const BARN_KEEP_STEP = 5;

// Contracts: deliver a quantity of one crop to one market within a few visits for a bonus.
// The quantity scales with the player's last harvest so contracts stay reachable as the farm grows.
export const CONTRACT_OFFER_COUNT = 2;
export const CONTRACT_MAX_ACTIVE = 2;
export const CONTRACT_REWARD_MULTIPLIER = 1.5; // reward per unit = base price × this
export const CONTRACT_DEADLINE_VISITS = { min: 2, max: 4 };
export const CONTRACT_QUANTITY_SHARE = 0.3; // share of the units brought to the last market visit
export const CONTRACT_MIN_QUANTITY = 10;

// Connected same-crop groups of this size or larger are harvested automatically after placement.
export const AUTO_HARVEST_MIN_GROUP_SIZE = 5;

// Auto-harvest yield per group = tiles × size bonus × seed level bonus × combo bonus (rounded).
// Bigger groups pay more per tile, so growing a group past 5 is worth it. Highest tier first.
export const HARVEST_SIZE_BONUSES = [
  { minSize: 12, multiplier: 2, label: 'Huge' },
  { minSize: 8, multiplier: 1.5, label: 'Big' },
];

// Each seed level above 1 adds this share of yield (level 10 = ×2.35 with 0.15).
export const SEED_LEVEL_YIELD_BONUS = 0.15;

// Every group harvested in a row adds COMBO_STEP_BONUS to the next one, up to COMBO_MAX_MULTIPLIER.
// A placement that harvests nothing, an emergency harvest or a new season resets the combo.
export const COMBO_STEP_BONUS = 0.1;
export const COMBO_MAX_MULTIPLIER = 2;

// The emergency harvest clears the whole field; the player holds at most one and restocks it in the shop.
// Restocking costs EMERGENCY_HARVEST_COST_SHARE of the player's coins, at least EMERGENCY_HARVEST_COST,
// so it stays a cheap rescue early on but remains a real decision for a rich player.
export const EMERGENCY_HARVEST_MAX_CHARGES = 1;
export const EMERGENCY_HARVEST_COST = 50;
export const EMERGENCY_HARVEST_COST_SHARE = 0.02;

export const MARKET_DEMAND_WEIGHTS = {
  village: { tomato: 5, carrot: 4, pumpkin: 1, beetroot: 1 },
  town: { tomato: 4, carrot: 3, pumpkin: 2, onion: 1, beetroot: 2, cherry: 1 },
  city: {
    tomato: 3,
    carrot: 3,
    pumpkin: 2,
    onion: 2,
    beetroot: 2,
    cherry: 2,
    watermelon: 1,
    eggplant: 1,
  },
};

// Upgrading a crop to level L costs its seed pack price × SEED_UPGRADE_COST_FACTOR × SEED_UPGRADE_COST_GROWTH^(L - 2),
// so each level costs more than the last and valuable crops are expensive to level.
export const SEED_UPGRADE_COST_FACTOR = 2;
export const SEED_UPGRADE_COST_GROWTH = 2;

export const CROP_SEED_CONFIG = Object.fromEntries(
  CROP_KEYS.map((cropKey) => {
    const unlocked = CROP_ECONOMY[cropKey].unlockCost === 0;

    return [cropKey, {
      label: cropKey[0].toUpperCase() + cropKey.slice(1),
      seedPackCost: CROP_ECONOMY[cropKey].seedPackCost,
      seedPackQty: 10,
      unlockCost: CROP_ECONOMY[cropKey].unlockCost,
      unlocked,
      level: unlocked ? 1 : 0,
      maxLevel: 10,
      harvestBonusBase: 5,
    }];
  }),
);
