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

export const MARKET_LOCATIONS = {
  village: { label: 'Village', entryFee: 5, trafficMin: 50, trafficMax: 100, competitors: 1 },
  town: { label: 'Town', entryFee: 100, trafficMin: 250, trafficMax: 750, competitors: 2 },
  city: { label: 'City', entryFee: 250, trafficMin: 1000, trafficMax: 5000, competitors: 3 },
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
