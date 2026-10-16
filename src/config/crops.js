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

export const CROP_BASE_PRICES = {
  tomato: 8,
  carrot: 6,
  pumpkin: 10,
  onion: 9,
  beetroot: 11,
  cherry: 14,
  watermelon: 16,
  eggplant: 13,
};

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
// minVariety: how many crop types, each with at least MIN_UNITS_FOR_VARIETY units, a trip must bring.
// A market's customers only buy the crops listed in its MARKET_DEMAND_WEIGHTS entry.
export const MARKET_LOCATIONS = {
  village: { label: 'Village', unlockCost: 0, trafficMin: 50, trafficMax: 100, minVariety: 2 },
  town: { label: 'Town', unlockCost: 2000, trafficMin: 250, trafficMax: 750, minVariety: 3 },
  city: { label: 'City', unlockCost: 25000, trafficMin: 1000, trafficMax: 5000, minVariety: 4 },
};

export const MIN_UNITS_FOR_VARIETY = 3;

// Customer demand curve: MARKET_BASE_BUY_RATE of customers buy at the base price;
// MARKET_PRICE_SENSITIVITY controls how quickly that share falls as the price rises.
export const MARKET_BASE_BUY_RATE = 0.7;
export const MARKET_PRICE_SENSITIVITY = 4;

// Connected same-crop groups of this size or larger are harvested automatically after placement.
export const AUTO_HARVEST_MIN_GROUP_SIZE = 5;

// The emergency harvest clears the whole field; the player holds at most one and restocks it in the shop.
export const EMERGENCY_HARVEST_MAX_CHARGES = 1;
export const EMERGENCY_HARVEST_COST = 50;

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

export const SEED_UPGRADE_COST_BY_LEVEL = Object.fromEntries(
  Array.from({ length: 9 }, (_, index) => [index + 2, (index + 1) * 10]),
);

export const CROP_SEED_CONFIG = Object.fromEntries(
  CROP_KEYS.map((cropKey) => {
    const unlocked = cropKey === 'tomato' || cropKey === 'carrot';

    return [cropKey, {
      label: cropKey[0].toUpperCase() + cropKey.slice(1),
      seedPackCost: 10,
      seedPackQty: 10,
      unlockCost: unlocked ? 0 : 100,
      unlocked,
      level: unlocked ? 1 : 0,
      maxLevel: 10,
      harvestBonusBase: 5,
    }];
  }),
);
