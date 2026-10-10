import { CROP_KEYS, INITIAL_CROP_INVENTORY, INITIAL_INVENTORY } from '../config/crops.js';

export function createInventoryState(overrides = {}) {
  return {
    ...INITIAL_INVENTORY,
    ...overrides,
  };
}

export function createCropInventoryState(overrides = {}) {
  return {
    ...INITIAL_CROP_INVENTORY,
    ...overrides,
  };
}

export function getInventoryTotal(inventory) {
  return CROP_KEYS.reduce((sum, cropKey) => sum + (inventory[cropKey] ?? 0), 0);
}

export function addStock(inventory, cropType, quantity = 1) {
  if (!CROP_KEYS.includes(cropType)) {
    return false;
  }

  inventory[cropType] = (inventory[cropType] ?? 0) + quantity;
  return true;
}

export function consumeStock(inventory, cropType, quantity = 1) {
  if (!CROP_KEYS.includes(cropType)) {
    return false;
  }

  const available = inventory[cropType] ?? 0;
  if (available < quantity) {
    return false;
  }

  inventory[cropType] -= quantity;
  return true;
}

export function weightedRandomCrop(inventory) {
  const candidates = CROP_KEYS.filter((cropKey) => (inventory[cropKey] ?? 0) > 0)
    .map((cropKey) => ({
      cropKey,
      weight: inventory[cropKey] ?? 0,
    }));

  if (candidates.length === 0) {
    return null;
  }

  const totalWeight = candidates.reduce((sum, item) => sum + item.weight, 0);
  let goal = Math.random() * totalWeight;

  for (const candidate of candidates) {
    goal -= candidate.weight;
    if (goal <= 0) {
      return candidate.cropKey;
    }
  }

  return candidates[candidates.length - 1].cropKey;
}
