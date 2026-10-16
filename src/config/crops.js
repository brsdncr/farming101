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

// minVariety: how many different crop types a trip to this market must bring.
export const MARKET_LOCATIONS = {
  village: { label: 'Village', entryFee: 5, trafficMin: 50, trafficMax: 100, competitors: 1, minVariety: 2 },
  town: { label: 'Town', entryFee: 100, trafficMin: 250, trafficMax: 750, competitors: 2, minVariety: 3 },
  city: { label: 'City', entryFee: 250, trafficMin: 1000, trafficMax: 5000, competitors: 3, minVariety: 4 },
};

// Connected same-crop groups of this size or larger are harvested automatically after placement.
export const AUTO_HARVEST_MIN_GROUP_SIZE = 5;

// The emergency harvest clears the whole field; the player holds at most one and restocks it in the shop.
export const EMERGENCY_HARVEST_MAX_CHARGES = 1;
export const EMERGENCY_HARVEST_COST = 50;

export const MARKET_RIVAL_STAGES = {
  village: {
    productPool: ['tomato', 'carrot', 'pumpkin', 'beetroot'],
    maxProducts: 3,
    stockCapacity: 30,
  },
  town: {
    productPool: ['tomato', 'carrot', 'pumpkin', 'onion', 'beetroot', 'cherry'],
    maxProducts: 5,
    stockCapacity: 100,
  },
  city: {
    productPool: CROP_KEYS,
    maxProducts: CROP_KEYS.length,
    stockCapacity: 300,
  },
};

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
