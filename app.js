import {
  AUTO_HARVEST_MIN_GROUP_SIZE,
  BARN_KEEP_STEP,
  BARN_LEVELS,
  BARN_SPOILAGE,
  COMBO_MAX_MULTIPLIER,
  COMBO_STEP_BONUS,
  CONTRACT_DEADLINE_VISITS,
  CONTRACT_MAX_ACTIVE,
  CONTRACT_MIN_QUANTITY,
  CONTRACT_OFFER_COUNT,
  CONTRACT_QUANTITY_SHARE,
  CONTRACT_REWARD_MULTIPLIER,
  CROP_BASE_PRICES,
  CROP_COLORS,
  CROP_EMOJIS,
  CROP_KEYS,
  CROP_SEED_CONFIG,
  EMERGENCY_HARVEST_COST,
  EMERGENCY_HARVEST_COST_SHARE,
  EMERGENCY_HARVEST_MAX_CHARGES,
  HARVEST_SIZE_BONUSES,
  MARKET_BASE_BUY_RATE,
  MARKET_DEMAND_WEIGHTS,
  MARKET_LOCATIONS,
  MARKET_PRICE_SENSITIVITY,
  MARKET_PRICE_STEP_SHARE,
  MIN_UNITS_FOR_VARIETY,
  SALE_DAY_MAX_MS,
  SALE_DAY_MIN_MS,
  SALE_DAY_MS_PER_CUSTOMER,
  SALE_DAY_SPEEDS,
  SEED_LEVEL_YIELD_BONUS,
  SEED_UPGRADE_COST_FACTOR,
  SEED_UPGRADE_COST_GROWTH,
} from './src/config/crops.js';
import {
  DEATH_AGE,
  GOAL_COINS,
  HOLD_SLOT_COST,
  SEASONS,
  START_AGE,
  VISITS_PER_SEASON,
  VISITS_PER_YEAR,
} from './src/config/game.js';
import { SHAPE_DEFINITIONS, SHAPE_TYPES } from './src/config/shapes.js';
import { buildSaleTimeline, formatDayClock, getSaleDaySnapshot, updateSaleStage } from './src/ui/saleDay.js';
import {
  GRID_SIZE,
  canPlaceShape,
  clearConnectedCells,
  cloneGrid,
  createGrid,
  findAllConnectedGroups,
  isInsideGrid,
  placeShapeOnGrid,
} from './src/state/gridState.js';
import {
  consumeStock,
  createCropInventoryState,
  createInventoryState,
  getInventoryTotal,
  weightedRandomCrop,
} from './src/state/inventoryState.js';
import {
  BEST_KEY,
  SAVE_KEY,
  readStored,
  removeStored,
  restoreGame,
  serializeGame,
  writeStored,
} from './src/state/saveState.js';

// The hand holds the block being played plus a preview of the next one.
const CURRENT_SLOT = 0;
const NEXT_SLOT = 1;
const HAND_SIZE = 2;
// How long harvested tiles pop and the harvest burst floats over the board.
const HARVEST_FLASH_MS = 900;

const state = createInitialGameState();
// Which top-level screen is shown. Not part of the saved game.
const uiState = {
  screen: 'game',
  confirmNewGame: false,
  shopCrop: null,
  saleSpeed: SALE_DAY_SPEEDS[0],
};
// The market day being played on the sale screen (see src/ui/saleDay.js). Not saved: a sale that is
// interrupted is settled from its saved result instead of being replayed.
let saleDay = null;
const dragState = {
  active: false,
  slotIndex: null,
  preview: null,
  pointer: null,
  overBoard: false,
  tileSize: 48,
  boardMetrics: null,
};

const pixelCanvas = typeof document === 'undefined' ? null : document.createElement('canvas');
if (pixelCanvas) {
  pixelCanvas.width = 16;
  pixelCanvas.height = 16;
}
const pixelCtx = pixelCanvas?.getContext('2d') ?? null;
if (pixelCtx) {
  pixelCtx.imageSmoothingEnabled = false;
}

const canvas = typeof document !== 'undefined' && document.getElementById('app') ? document.getElementById('app').appendChild(Object.assign(document.createElement('canvas'), {
  id: 'gameCanvas',
  width: 480,
  height: 560,
})) : null;

const ctx = canvas ? canvas.getContext('2d') : null;
if (ctx) {
  ctx.imageSmoothingEnabled = false;
}

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 560;
const BOARD_X = 42;
const BOARD_Y = 120;
const BOARD_CELL = 52;
const BOARD_GAP = 6;
const HAND_Y = 440;
const HAND_X = 42;
const INVENTORY_X = 350;
const INVENTORY_Y = 120;

const CROP_SPRITES = {};

function createCropSprite(cropKey) {
  if (!pixelCanvas) {
    return null;
  }

  const sprite = document.createElement('canvas');
  sprite.width = 16;
  sprite.height = 16;
  const spriteCtx = sprite.getContext('2d');
  spriteCtx.imageSmoothingEnabled = false;
  spriteCtx.textAlign = 'center';
  spriteCtx.textBaseline = 'middle';
  spriteCtx.font = '14px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  spriteCtx.fillText(CROP_EMOJIS[cropKey] ?? '🌱', 8, 9);
  return sprite;
}

function getCropSprite(cropKey) {
  if (!CROP_SPRITES[cropKey]) {
    CROP_SPRITES[cropKey] = createCropSprite(cropKey);
  }
  return CROP_SPRITES[cropKey];
}

function drawPixelRect(x, y, width, height, color) {
  if (!ctx) {
    return;
  }

  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(width), Math.floor(height));
}

function drawText(text, x, y, size, color, align = 'left') {
  if (!ctx) {
    return;
  }

  ctx.textAlign = align;
  ctx.font = `${Math.floor(size)}px "Press Start 2P", monospace`;
  ctx.fillStyle = color;
  ctx.fillText(text, Math.floor(x), Math.floor(y));
}

function drawSprite(sprite, x, y, width, height) {
  if (!ctx || !sprite) {
    return;
  }

  ctx.drawImage(sprite, Math.floor(x), Math.floor(y), Math.floor(width), Math.floor(height));
}

function drawCropSpriteAt(cropKey, x, y, size) {
  const sprite = getCropSprite(cropKey);
  drawSprite(sprite, x, y, size, size);
}

function drawButton(x, y, width, height, label, bgColor, textColor) {
  drawPixelRect(x, y, width, height, bgColor);
  drawPixelRect(x + 2, y + 2, width - 4, height - 4, 'rgba(0,0,0,0.12)');
  drawText(label, x + width / 2, y + height / 2 + 8, 8, textColor, 'center');
}

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

const appRoot = typeof document === 'undefined' ? null : document.getElementById('app');
if (appRoot) {
  appRoot.innerHTML = '';
  appRoot.appendChild(canvas);
}

function cloneTetromino(tetromino) {
  if (!tetromino || !Array.isArray(tetromino.cells)) {
    return {
      id: `empty-${Math.random().toString(36).slice(2, 10)}`,
      shapeType: 'O',
      cells: [],
    };
  }

  return {
    ...tetromino,
    cells: tetromino.cells.map((cell) => ({ ...cell })),
  };
}

function createSeedState(overrides = {}) {
  const base = {};

  for (const cropKey of CROP_KEYS) {
    const config = CROP_SEED_CONFIG[cropKey] ?? {};
    base[cropKey] = config.level ?? 0;
  }

  return { ...base, ...overrides };
}

function getCropSeedConfig(cropKey) {
  return CROP_SEED_CONFIG[cropKey] ?? {
    label: cropKey,
    seedPackCost: 10,
    seedPackQty: 10,
    unlockCost: 100,
    unlocked: false,
    level: 0,
    maxLevel: 10,
    harvestBonusBase: 5,
  };
}

function getCropSeedLevel(cropKey) {
  return Number(state.seedLevels[cropKey] ?? getCropSeedConfig(cropKey).level ?? 0);
}

function getCropSeedPrice(cropKey) {
  return Number(getCropSeedConfig(cropKey).seedPackCost ?? 10);
}

function getCropSeedPackSize(cropKey) {
  return Number(getCropSeedConfig(cropKey).seedPackQty ?? 10);
}

function getUnlockCost(cropKey) {
  return Number(getCropSeedConfig(cropKey).unlockCost ?? 100);
}

function getUpgradeCost(cropKey) {
  const currentLevel = getCropSeedLevel(cropKey);
  const config = getCropSeedConfig(cropKey);

  if (currentLevel >= (config.maxLevel ?? 10)) {
    return null;
  }

  const nextLevel = currentLevel + 1;
  return Math.round(getCropSeedPrice(cropKey) * SEED_UPGRADE_COST_FACTOR * SEED_UPGRADE_COST_GROWTH ** (nextLevel - 2));
}

function setShopFeedback(message, kind = 'success') {
  state.shopFeedback = { message, kind };
  render();
}

function buySeedPack(cropKey) {
  const config = getCropSeedConfig(cropKey);
  const currentLevel = getCropSeedLevel(cropKey);
  const cost = Number(config.seedPackCost ?? 10);
  const quantity = Number(config.seedPackQty ?? 10);

  if (currentLevel <= 0 || state.coins < cost) {
    return false;
  }

  state.coins -= cost;
  state.inventory[cropKey] = (state.inventory[cropKey] ?? 0) + quantity;
  state.shopFeedback = { message: `Bought ${quantity}x ${config.label} seeds`, kind: 'success' };
  render();
  return true;
}

function unlockCrop(cropKey) {
  const config = getCropSeedConfig(cropKey);
  const cost = Number(config.unlockCost ?? 100);

  if (getCropSeedLevel(cropKey) > 0 || state.coins < cost) {
    return false;
  }

  state.coins -= cost;
  state.seedLevels[cropKey] = 1;
  state.shopFeedback = { message: `${config.label} unlocked`, kind: 'success' };
  render();
  return true;
}

function upgradeCrop(cropKey) {
  const currentLevel = getCropSeedLevel(cropKey);
  const cost = getUpgradeCost(cropKey);

  if (cost === null || state.coins < cost) {
    return false;
  }

  state.coins -= cost;
  state.seedLevels[cropKey] = currentLevel + 1;
  state.shopFeedback = { message: `${getCropSeedConfig(cropKey).label} upgraded to level ${currentLevel + 1}`, kind: 'success' };
  render();
  return true;
}

function consumeTetrominoFromInventory(inventory, tetromino) {
  if (!tetromino || !Array.isArray(tetromino.cells) || tetromino.cells.length === 0) {
    return true;
  }

  const usage = {};
  for (const cell of tetromino.cells) {
    const cropType = cell.cropType;
    // Unfilled blocks (drawn when stock ran low) cost nothing.
    if (!cropType) {
      continue;
    }
    usage[cropType] = (usage[cropType] ?? 0) + 1;
  }

  for (const [cropType, count] of Object.entries(usage)) {
    if ((inventory[cropType] ?? 0) < count) {
      return false;
    }
  }

  for (const [cropType, count] of Object.entries(usage)) {
    inventory[cropType] = (inventory[cropType] ?? 0) - count;
  }

  return true;
}

function createShapeBag() {
  const bag = [];
  for (const shapeType of SHAPE_TYPES) {
    bag.push(shapeType, shapeType);
  }

  for (let index = bag.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [bag[index], bag[swapIndex]] = [bag[swapIndex], bag[index]];
  }

  return bag;
}

function normalizeCells(cells) {
  const minRow = Math.min(...cells.map((cell) => cell.row));
  const minCol = Math.min(...cells.map((cell) => cell.col));

  return cells.map((cell) => ({
    row: cell.row - minRow,
    col: cell.col - minCol,
    cropType: cell.cropType,
  }));
}

function rotateCells(cells) {
  const maxRow = Math.max(...cells.map((cell) => cell.row));
  const maxCol = Math.max(...cells.map((cell) => cell.col));

  const rotated = cells.map((cell) => ({
    row: maxCol - cell.col,
    col: cell.row,
    cropType: cell.cropType,
  }));

  return normalizeCells(rotated);
}

function createTetrominoFromShape(shapeType, inventory) {
  const baseCells = SHAPE_DEFINITIONS[shapeType].map((cell) => ({ ...cell, cropType: null }));
  const availableInventory = { ...inventory };
  const totalAvailable = getInventoryTotal(availableInventory);

  if (totalAvailable <= 0) {
    return {
      id: `${shapeType}-${Math.random().toString(36).slice(2, 10)}`,
      shapeType,
      cells: [],
    };
  }

  // The full shape is always kept; blocks left unfilled when stock runs out stay null.
  for (const cell of baseCells) {
    const cropType = weightedRandomCrop(availableInventory);
    if (!cropType) {
      break;
    }

    cell.cropType = cropType;
    consumeStock(availableInventory, cropType, 1);
  }

  return {
    id: `${shapeType}-${Math.random().toString(36).slice(2, 10)}`,
    shapeType,
    cells: normalizeCells(baseCells),
  };
}

// Seeds still free once the crops shown in the other hand slots are set aside.
function getUnreservedInventory(inventory, slots, excludedSlotIndex = null) {
  const available = { ...inventory };

  slots.forEach((tetromino, index) => {
    if (index === excludedSlotIndex || !Array.isArray(tetromino?.cells)) {
      return;
    }

    for (const cell of tetromino.cells) {
      if (cell.cropType) {
        available[cell.cropType] = Math.max(0, (available[cell.cropType] ?? 0) - 1);
      }
    }
  });

  return available;
}

function ensureBagHasShapes(bag) {
  if (bag.length >= 3) {
    return bag;
  }

  return [...bag, ...createShapeBag()];
}

function drawNextTetrominoFromBag(bag, inventory) {
  const nextBag = ensureBagHasShapes(bag);
  const shapeType = nextBag.shift();
  const tetromino = createTetrominoFromShape(shapeType, inventory);
  return { tetromino, bag: nextBag };
}

function createHandState(inventory) {
  const bag = createShapeBag();
  const slots = [];

  for (let index = 0; index < HAND_SIZE; index += 1) {
    const next = drawNextTetrominoFromBag(bag, getUnreservedInventory(inventory, slots));
    slots.push(next.tetromino);
    bag.length = 0;
    for (const entry of next.bag) {
      bag.push(entry);
    }
  }

  return {
    bag,
    slots,
    hold: null,
  };
}

function createMarketState(overrides = {}) {
  const currentLocation = overrides.location ?? 'village';
  const profile = MARKET_LOCATIONS[currentLocation];

  return {
    location: currentLocation,
    crop: 'tomato',
    trafficMin: profile.trafficMin,
    trafficMax: profile.trafficMax,
    prices: { ...CROP_BASE_PRICES },
    keep: {},
    pendingSale: [],
    lastSummary: 'No sales run yet.',
    simulating: false,
    saleScreenOpen: false,
    saleComplete: false,
    activeSimulation: null,
    activeSelectedCrops: [],
    skipAnimation: false,
    skipAnimationEnabledAt: 0,
    ...overrides,
  };
}

function createUnlockedMarketsState() {
  return Object.fromEntries(
    Object.entries(MARKET_LOCATIONS).map(([locationKey, profile]) => [locationKey, profile.unlockCost === 0]),
  );
}

function getMarketLocationProfile() {
  return MARKET_LOCATIONS[state.market.location] ?? MARKET_LOCATIONS.village;
}

function isMarketUnlocked(locationKey) {
  return state.unlockedMarkets[locationKey] === true;
}

// The crops a market's customers buy; other harvested crops can't be sold there.
function getMarketProductPool(locationKey) {
  return Object.keys(MARKET_DEMAND_WEIGHTS[locationKey] ?? {});
}

// Units of each crop this market buys that would go on sale here: the harvest minus what is kept.
function getOfferedUnits(locationKey) {
  return Object.fromEntries(getMarketProductPool(locationKey).map((crop) => [
    crop,
    Math.max(0, (state.cropInventory[crop] ?? 0) - (state.market.keep[crop] ?? 0)),
  ]));
}

// Crop types on sale here with enough units to count toward the variety minimum. Crops kept in the
// barn don't count: the rule is about what is actually sold.
function getVarietyCount(locationKey) {
  return Object.values(getOfferedUnits(locationKey)).filter((units) => units >= MIN_UNITS_FOR_VARIETY).length;
}

// Share of customers who buy at this price: MARKET_BASE_BUY_RATE at the base price,
// approaching 100% as the price drops and 0% as it rises.
function getBuyChance(price, basePrice) {
  const priceRatio = price / basePrice;
  const baseOdds = (1 - MARKET_BASE_BUY_RATE) / MARKET_BASE_BUY_RATE;
  return 1 / (1 + baseOdds * Math.exp(MARKET_PRICE_SENSITIVITY * (priceRatio - 1)));
}

// What the player is told before selling a crop at `price` here: how many customers want it (for the
// market's lowest and highest traffic) and the share who buy at this price. Working out how many units
// that sells is left to the player.
function getDemandForecast(locationKey, crop, price) {
  const profile = MARKET_LOCATIONS[locationKey];
  const weights = MARKET_DEMAND_WEIGHTS[locationKey] ?? {};
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const demandShare = totalWeight > 0 ? (weights[crop] ?? 0) / totalWeight : 0;
  const buyChance = getBuyChance(price, CROP_BASE_PRICES[crop]);
  return {
    wanted: {
      min: Math.round(profile.trafficMin * demandShare),
      max: Math.round(profile.trafficMax * demandShare),
    },
    buyChance,
  };
}

function setMarketLocation(locationKey) {
  if (!MARKET_LOCATIONS[locationKey] || !isMarketUnlocked(locationKey)) {
    return;
  }

  state.market.location = locationKey;
  const profile = MARKET_LOCATIONS[locationKey];
  state.market.trafficMin = profile.trafficMin;
  state.market.trafficMax = profile.trafficMax;
  state.market.lastSummary = `${profile.label} market selected.`;
  render();
}

function unlockMarket(locationKey) {
  const profile = MARKET_LOCATIONS[locationKey];

  if (!profile || isMarketUnlocked(locationKey) || state.coins < profile.unlockCost) {
    return false;
  }

  state.coins -= profile.unlockCost;
  state.unlockedMarkets[locationKey] = true;
  state.shopFeedback = { message: `${profile.label} market unlocked`, kind: 'success' };
  render();
  return true;
}

// ---------- Farm upgrades ----------

// ---------- Barn ----------

function getBarnLevel() {
  return state.upgrades.barnLevel ?? 0;
}

function getBarnCapacity() {
  return BARN_LEVELS[getBarnLevel()].capacity;
}

function getNextBarnUpgrade() {
  return BARN_LEVELS[getBarnLevel() + 1] ?? null;
}

function getKeptTotal() {
  return CROP_KEYS.reduce((sum, crop) => sum + (state.market.keep[crop] ?? 0), 0);
}

// Units lost from a kept crop by the next visit: BARN_SPOILAGE, rounded up.
function getSpoiledUnits(kept) {
  return kept > 0 ? Math.ceil(kept * BARN_SPOILAGE) : 0;
}

// Units of a crop to keep for a later visit, limited by the harvest and the barn's free space.
function setKeep(cropKey, quantity) {
  const keptElsewhere = getKeptTotal() - (state.market.keep[cropKey] ?? 0);
  const max = Math.min(state.cropInventory[cropKey] ?? 0, getBarnCapacity() - keptElsewhere);
  state.market.keep[cropKey] = Math.max(0, Math.min(Math.floor(quantity), max));
  render();
}

function adjustKeep(cropKey, delta) {
  setKeep(cropKey, (state.market.keep[cropKey] ?? 0) + delta);
}

function buyBarnUpgrade() {
  const upgrade = getNextBarnUpgrade();
  if (!upgrade || state.coins < upgrade.cost) {
    return false;
  }

  state.coins -= upgrade.cost;
  state.upgrades.barnLevel = getBarnLevel() + 1;
  state.shopFeedback = { message: `Barn expanded to ${upgrade.capacity} units`, kind: 'success' };
  render();
  return true;
}

function buyHoldSlot() {
  if (state.upgrades.hold || state.coins < HOLD_SLOT_COST) {
    return false;
  }

  state.coins -= HOLD_SLOT_COST;
  state.upgrades.hold = true;
  state.shopFeedback = { message: 'Hold slot unlocked', kind: 'success' };
  render();
  return true;
}

function getPriceStep(cropKey) {
  return Math.max(1, Math.round(CROP_BASE_PRICES[cropKey] * MARKET_PRICE_STEP_SHARE));
}

// Moves a crop's price one step up (direction 1) or down (direction -1).
function adjustMarketPrice(direction, cropKey = state.market.crop || 'tomato') {
  const currentPrice = state.market.prices[cropKey] ?? CROP_BASE_PRICES[cropKey];
  const nextPrice = Math.max(1, currentPrice + direction * getPriceStep(cropKey));
  state.market.prices[cropKey] = nextPrice;
  state.market.crop = cropKey;
  render();
}

function randomMarketCount(min, max, random = Math.random) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function weightedRandomEntry(weights, random) {
  const entries = Object.entries(weights).filter(([, weight]) => Number(weight) > 0);
  const totalWeight = entries.reduce((sum, [, weight]) => sum + Number(weight), 0);

  if (totalWeight <= 0) {
    return null;
  }

  let target = random() * totalWeight;
  for (const [key, weight] of entries) {
    target -= Number(weight);
    if (target < 0) {
      return key;
    }
  }

  return entries.at(-1)?.[0] ?? null;
}

// Each customer wants one crop, drawn from the market's demand weights. A customer who
// wants a crop the player brought (and still has in stock) buys it with getBuyChance.
// Every customer who reaches the stall becomes an event; customerNeeds lists all customers in
// arrival order, which the sale animation uses for the crowd.
function buildMarketCustomerSimulation(profile, selectedCrops, options = {}) {
  const random = options.random ?? Math.random;
  const demandWeights = MARKET_DEMAND_WEIGHTS[state.market.location] ?? MARKET_DEMAND_WEIGHTS.village;
  const traffic = randomMarketCount(profile.trafficMin, profile.trafficMax, random);
  const seller = {
    name: 'You',
    customers: 0,
    requested: 0,
    sold: 0,
    revenue: 0,
    crops: {},
    cropSales: {},
    assortment: {},
  };

  for (const crop of selectedCrops) {
    const stock = Math.max(0, Number(state.cropInventory[crop] ?? 0));
    if (stock > 0) {
      seller.assortment[crop] = {
        price: Math.max(1, Number(state.market.prices[crop] ?? CROP_BASE_PRICES[crop])),
        stock,
        initialStock: stock,
        wanted: 0,
        served: 0,
        soldOutAt: null,
      };
    }
  }

  const customerNeeds = Array.from({ length: traffic }, () => weightedRandomEntry(demandWeights, random));
  const events = [];

  customerNeeds.forEach((crop, customerIndex) => {
    const offer = seller.assortment[crop];
    if (!offer) {
      return;
    }

    seller.requested += 1;
    offer.wanted += 1;
    // Customers arriving after a crop sold out find none left.
    if (offer.stock <= 0) {
      return;
    }

    seller.customers += 1;
    offer.served += 1;
    const bought = random() < getBuyChance(offer.price, CROP_BASE_PRICES[crop]);

    if (bought) {
      offer.stock -= 1;
      seller.sold += 1;
      seller.revenue += offer.price;
      seller.crops[crop] = (seller.crops[crop] ?? 0) + 1;
      const cropSale = seller.cropSales[crop] ?? { quantity: 0, price: offer.price, revenue: 0 };
      cropSale.quantity += 1;
      cropSale.revenue += offer.price;
      seller.cropSales[crop] = cropSale;
      if (offer.stock === 0) {
        offer.soldOutAt = customerIndex + 1;
      }
    }

    events.push({
      customerIndex: customerIndex + 1,
      crop,
      price: offer.price,
      sold: bought ? 1 : 0,
      revenue: bought ? offer.price : 0,
    });
  });

  return {
    sellers: [seller],
    events,
    customerNeeds,
    totalCustomers: traffic,
    totalRequested: seller.requested,
    totalSold: seller.sold,
    totalRevenue: seller.revenue,
  };
}

// Settles a sale once: every harvested crop went to market, so unsold stock and crops
// this market doesn't buy spoil. Harvested crops never turn back into seeds.
function finalizeMarketSimulation(profile, simulation) {
  if (!state.market.simulating || state.market.activeSimulation !== simulation) {
    return;
  }

  const playerSeller = simulation.sellers[0];
  const totalRevenue = playerSeller.revenue;
  const summaries = CROP_KEYS
    .filter((crop) => (state.cropInventory[crop] ?? 0) > 0)
    .map((crop) => {
      const brought = state.cropInventory[crop];
      const sale = playerSeller.cropSales[crop];
      return sale
        ? `${crop}: sold ${sale.quantity}/${brought} for +${sale.revenue}`
        : `${crop}: ${brought} spoiled`;
    });

  const contracts = simulation.contracts ?? [];
  const contractRewards = contracts.reduce((sum, contract) => sum + contract.reward, 0);
  summaries.unshift(...contracts.map((contract) => `contract ${contract.quantity} ${contract.crop}: +${contract.reward}`));
  const kept = simulation.kept ?? {};
  summaries.push(...Object.entries(kept).map(([crop, units]) => `${crop}: ${units} kept in the barn (${getSpoiledUnits(units)} spoil)`));

  state.cropInventory = createCropInventoryState();
  for (const [crop, units] of Object.entries(kept)) {
    state.cropInventory[crop] = units - getSpoiledUnits(units);
  }
  state.market.keep = {};
  state.coins += totalRevenue + contractRewards;
  state.lastHarvestUnits = simulation.unitsBrought ?? state.lastHarvestUnits;
  state.lastHarvestCrops = simulation.harvestedCrops ?? state.lastHarvestCrops;
  advanceTime();
  state.market.simulating = false;
  state.market.saleComplete = true;
  state.market.saleReport = {
    sellers: simulation.sellers,
    totalCustomers: simulation.totalCustomers,
    totalRequested: simulation.totalRequested,
    totalSold: simulation.totalSold,
    totalRevenue: simulation.totalRevenue,
    contracts,
  };
  state.market.skipAnimation = false;
  state.market.skipAnimationEnabledAt = 0;
  state.market.activeSimulation = null;
  state.market.activeSelectedCrops = [];
  saleDay = null;
  state.market.lastSummary = `Selling in ${profile.label}: ${summaries.join(' • ')}. Total revenue: ${totalRevenue + contractRewards} coins.`;
  render();
}

// Below this share of interested customers served, a crop sold out "early".
const EARLY_SELL_OUT_SHARE = 0.6;
// Below this share of buyers among the customers served, the price drove customers away.
const LOW_BUY_SHARE = 0.5;

// One line of advice per crop for the sale report, from how its stock and customers played out.
function getCropSaleTip(crop, offer) {
  const sold = offer.initialStock - offer.stock;
  if (!offer.wanted) {
    return { kind: 'less', text: `Nobody here wanted ${crop} today: sell it at another market.` };
  }
  if (offer.stock === 0) {
    return offer.served / offer.wanted < EARLY_SELL_OUT_SHARE
      ? { kind: 'up', text: `Sold out after ${offer.served} of ${offer.wanted} interested customers: charge more or bring more.` }
      : { kind: 'ok', text: 'Sold out near closing: the price looks right.' };
  }
  if (sold / offer.served < LOW_BUY_SHARE) {
    return { kind: 'down', text: `${offer.served - sold} of ${offer.served} customers passed at ${offer.price} coins: try a lower price.` };
  }
  if (offer.wanted >= offer.initialStock) {
    return { kind: 'down', text: `${offer.stock} left: a slightly lower price would sell them.` };
  }
  return { kind: 'less', text: `Only ${offer.wanted} customers wanted ${crop}: bring fewer, or sell some at another market.` };
}

function getSellingBlocker() {
  const profile = getMarketLocationProfile();
  const locationKey = state.market.location;

  if (!isMarketUnlocked(locationKey)) {
    return `${profile.label} is locked. Unlock it in the shop.`;
  }

  const variety = getVarietyCount(locationKey);
  if (variety < profile.minVariety) {
    return `${profile.label} needs ${profile.minVariety} crop types with ${MIN_UNITS_FOR_VARIETY}+ units each on sale (kept crops don't count). You have ${variety}.`;
  }

  return null;
}

function canSellAnywhere() {
  return Object.entries(MARKET_LOCATIONS).some(([locationKey, profile]) => (
    isMarketUnlocked(locationKey) && getVarietyCount(locationKey) >= profile.minVariety
  ));
}

// Leaves the market for a fresh field: whatever is still planted is discarded, then the shop opens.
function startNextSeason() {
  clearBoardForReturn();
  state.marketOpen = false;
  state.market.saleScreenOpen = false;
  state.market.saleComplete = false;
  state.market.simulating = false;
  state.market.activeSimulation = null;
  state.market.activeSelectedCrops = [];
  state.market.skipAnimationEnabledAt = 0;
  saleDay = null;
  state.shopOpen = true;
  generateContractOffers();
}

// Way out when no unlocked market accepts the harvest: time passes and the harvest is lost.
function skipSeason() {
  if (state.market.simulating || canSellAnywhere()) {
    return;
  }

  state.cropInventory = createCropInventoryState();
  advanceTime();
  startNextSeason();
  state.market.lastSummary = 'Season skipped. The harvest and the field were discarded.';
  render();
}

// ---------- Contracts ----------

// Crop/market pairs a contract can ask for: crops the player has unlocked, at open markets that buy them.
// Offers favour crops harvested at the last market visit, so a contract never pushes a new crop type
// into the seed mix (which would clog the field for many seasons).
function getContractTargets() {
  const targets = Object.keys(MARKET_LOCATIONS)
    .filter(isMarketUnlocked)
    .flatMap((locationKey) => getMarketProductPool(locationKey)
      .filter((crop) => getCropSeedLevel(crop) > 0)
      .map((crop) => ({ crop, locationKey })));
  const grown = targets.filter(({ crop }) => state.lastHarvestCrops.includes(crop));
  return grown.length > 0 ? grown : targets;
}

function getContractQuantity() {
  const scaled = Math.round((state.lastHarvestUnits * CONTRACT_QUANTITY_SHARE) / 5) * 5;
  return Math.max(CONTRACT_MIN_QUANTITY, scaled);
}

// Replaces the open offers. Offers never duplicate an active contract's crop and market.
function generateContractOffers(random = Math.random) {
  const taken = new Set(state.contracts.active.map((contract) => `${contract.crop}@${contract.locationKey}`));
  const targets = getContractTargets().filter(({ crop, locationKey }) => !taken.has(`${crop}@${locationKey}`));
  const offers = [];

  while (offers.length < CONTRACT_OFFER_COUNT && targets.length > 0) {
    const { crop, locationKey } = targets.splice(Math.floor(random() * targets.length), 1)[0];
    const quantity = getContractQuantity();
    offers.push({
      id: state.contracts.nextId,
      crop,
      locationKey,
      quantity,
      reward: Math.round(quantity * CROP_BASE_PRICES[crop] * CONTRACT_REWARD_MULTIPLIER),
      visits: randomMarketCount(CONTRACT_DEADLINE_VISITS.min, CONTRACT_DEADLINE_VISITS.max, random),
    });
    state.contracts.nextId += 1;
  }

  state.contracts.offers = offers;
}

function acceptContract(contractId) {
  const offer = state.contracts.offers.find((contract) => contract.id === contractId);
  if (!offer || state.contracts.active.length >= CONTRACT_MAX_ACTIVE) {
    return false;
  }

  state.contracts.offers = state.contracts.offers.filter((contract) => contract !== offer);
  // Deliverable at this visit and the following ones, `visits` in total.
  state.contracts.active.push({ ...offer, lastRound: state.round + offer.visits - 1 });
  state.shopFeedback = { message: `Contract accepted: ${offer.quantity} ${offer.crop} to ${MARKET_LOCATIONS[offer.locationKey].label}`, kind: 'success' };
  render();
  return true;
}

function getContractVisitsLeft(contract) {
  return contract.lastRound - state.round + 1;
}

function expireContracts() {
  state.contracts.active = state.contracts.active.filter((contract) => getContractVisitsLeft(contract) > 0);
}

// Sets aside the units for every active contract this market can fill right now (all at once, never partly).
// Rewards are paid when the sale is settled, together with the sale revenue.
function deliverContracts(locationKey) {
  const delivered = [];

  for (const contract of state.contracts.active) {
    if (contract.locationKey === locationKey && (state.cropInventory[contract.crop] ?? 0) >= contract.quantity) {
      state.cropInventory[contract.crop] -= contract.quantity;
      delivered.push(contract);
    }
  }

  state.contracts.active = state.contracts.active.filter((contract) => !delivered.includes(contract));
  return delivered;
}

// Builds the sale for the current market: crops kept for the barn and contract units are set aside
// first, then the rest is offered to customers. The result is fixed here; settling it later only
// applies it.
function createSale(profile) {
  const unitsBrought = Object.values(state.cropInventory).reduce((sum, quantity) => sum + quantity, 0);
  const harvestedCrops = CROP_KEYS.filter((crop) => (state.cropInventory[crop] ?? 0) > 0);
  const kept = {};
  for (const crop of CROP_KEYS) {
    const units = Math.min(state.market.keep[crop] ?? 0, state.cropInventory[crop] ?? 0);
    if (units > 0) {
      kept[crop] = units;
      state.cropInventory[crop] -= units;
    }
  }
  const contracts = deliverContracts(state.market.location);
  const selectedCrops = getMarketProductPool(state.market.location)
    .filter((crop) => (state.cropInventory[crop] ?? 0) > 0);

  return {
    ...buildMarketCustomerSimulation(profile, selectedCrops),
    contracts,
    kept,
    unitsBrought,
    harvestedCrops,
    selectedCrops,
  };
}

function startSelling() {
  const profile = getMarketLocationProfile();
  const blocker = getSellingBlocker();

  if (blocker) {
    state.market.lastSummary = blocker;
    render();
    return;
  }

  const simulation = createSale(profile);
  const selectedCrops = simulation.selectedCrops;

  state.marketOpen = false;
  state.market.saleScreenOpen = true;
  state.market.simulating = true;
  state.market.saleComplete = false;
  state.market.saleReport = null;
  state.market.activeSimulation = simulation;
  state.market.activeSelectedCrops = [...selectedCrops];
  state.market.skipAnimation = false;
  state.market.skipAnimationEnabledAt = Date.now() + 3000;
  state.market.lastSummary = `Selling in ${profile.label}...`;
  saleDay = {
    simulation,
    timeline: buildSaleTimeline(simulation, {
      emojis: CROP_EMOJIS,
      basePrices: CROP_BASE_PRICES,
      msPerCustomer: SALE_DAY_MS_PER_CUSTOMER,
      minMs: SALE_DAY_MIN_MS,
      maxMs: SALE_DAY_MAX_MS,
    }),
    elapsed: 0,
    lastFrameAt: Date.now(),
    walkerElements: new Map(),
  };
  render();
  scheduleSaleDayFrame(() => advanceSaleDay(profile, simulation));
}

// Animation frames when the sale screen is on display; a plain timer otherwise (tests, no DOM),
// so the day still ends and settles the sale.
function scheduleSaleDayFrame(callback) {
  const stage = typeof document === 'undefined' ? null : document.querySelector('.market-sim-stage');
  if (stage && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(callback);
  } else {
    setTimeout(callback, 16);
  }
}

function advanceSaleDay(profile, simulation) {
  // Stop once this sale has been settled (e.g. via Skip) or left.
  if (!saleDay || saleDay.simulation !== simulation || state.market.activeSimulation !== simulation || !state.market.simulating) {
    return;
  }

  const now = Date.now();
  // A long gap (a hidden window) pauses the day instead of jumping ahead.
  saleDay.elapsed += Math.min(now - saleDay.lastFrameAt, 100) * uiState.saleSpeed;
  saleDay.lastFrameAt = now;

  if (saleDay.elapsed >= saleDay.timeline.durationMs) {
    finalizeMarketSimulation(profile, simulation);
    return;
  }

  const stage = typeof document === 'undefined' ? null : document.querySelector('.market-sim-stage');
  if (stage) {
    updateSaleStage(stage, saleDay.timeline, saleDay.elapsed, saleDay.walkerElements);
    const skipButton = document.getElementById('sale-screen-skip-animation');
    if (skipButton?.disabled && now >= state.market.skipAnimationEnabledAt) {
      skipButton.disabled = false;
    }
  }

  scheduleSaleDayFrame(() => advanceSaleDay(profile, simulation));
}

function cycleSaleSpeed() {
  const index = SALE_DAY_SPEEDS.indexOf(uiState.saleSpeed);
  uiState.saleSpeed = SALE_DAY_SPEEDS[(index + 1) % SALE_DAY_SPEEDS.length];
}

function createInitialGameState() {
  const inventory = createInventoryState();
  const hand = createHandState(inventory);

  const cropInventory = createCropInventoryState();

  const seedLevels = createSeedState();

  return {
    round: 1,
    age: START_AGE,
    season: SEASONS[0],
    coins: 20,
    grid: createGrid(6, 6),
    inventory,
    cropInventory,
    seedLevels,
    hand,
    market: createMarketState(),
    unlockedMarkets: createUnlockedMarketsState(),
    marketOpen: false,
    shopOpen: false,
    shopFeedback: null,
    shopScrollTop: 0,
    highlightedGroup: [],
    activeSlotIndex: null,
    dragPreview: null,
    gameOver: false,
    gameOverReason: '',
    gameResult: null,
    emergencyHarvests: EMERGENCY_HARVEST_MAX_CHARGES,
    combo: 0,
    contracts: { offers: [], active: [], nextId: 1 },
    upgrades: { hold: false, barnLevel: 0 },
    lastHarvestUnits: 0,
    lastHarvestCrops: [],
    harvestFeedback: '',
    harvestFlash: null,
  };
}

// Calendar after a number of finished market visits: 2 visits per season, 4 per year.
function getCalendar(visitsCompleted) {
  return {
    age: START_AGE + Math.floor(visitsCompleted / VISITS_PER_YEAR),
    season: SEASONS[Math.floor(visitsCompleted / VISITS_PER_SEASON) % SEASONS.length],
  };
}

function advanceTime() {
  state.round += 1;
  Object.assign(state, getCalendar(state.round - 1));
  expireContracts();
}

// The next thing worth saving for: the cheapest locked market, the hold slot, or locked crop that an
// open market buys. Once everything is bought, the coin goal itself.
function getNextGoal() {
  const lockedMarkets = Object.entries(MARKET_LOCATIONS)
    .filter(([locationKey]) => !isMarketUnlocked(locationKey))
    .map(([, profile]) => ({ label: `${profile.label} market`, cost: profile.unlockCost }));
  const sellableCrops = new Set(Object.keys(MARKET_LOCATIONS)
    .filter(isMarketUnlocked)
    .flatMap(getMarketProductPool));
  const lockedCrops = CROP_KEYS
    .filter((crop) => getCropSeedLevel(crop) === 0 && sellableCrops.has(crop))
    .map((crop) => ({ label: getCropSeedConfig(crop).label, cost: getUnlockCost(crop) }));

  const barnUpgrade = getNextBarnUpgrade();
  const upgrades = [
    ...(state.upgrades.hold ? [] : [{ label: 'Hold slot', cost: HOLD_SLOT_COST }]),
    ...(barnUpgrade ? [{ label: `Barn ${barnUpgrade.capacity}`, cost: barnUpgrade.cost }] : []),
  ];

  const next = [...lockedMarkets, ...lockedCrops, ...upgrades].sort((a, b) => a.cost - b.cost)[0]
    ?? { label: 'Millionaire', cost: GOAL_COINS };
  return { ...next, progress: Math.min(1, state.coins / next.cost), ready: state.coins >= next.cost };
}

function getCheapestSeedPackCost() {
  return Math.min(...CROP_KEYS.filter((crop) => getCropSeedLevel(crop) > 0).map(getCropSeedPrice));
}

// Nothing left to plant, harvest or sell, and not enough coins to buy seeds.
function isBankrupt() {
  return getInventoryTotal(state.inventory) === 0
    && getInventoryTotal(state.cropInventory) === 0
    && isFieldEmpty()
    && state.coins < getCheapestSeedPackCost();
}

function getGameEndResult() {
  if (state.coins >= GOAL_COINS) {
    return {
      kind: 'won',
      reason: `You became a millionaire at age ${state.age}!`,
    };
  }

  if (state.age >= DEATH_AGE) {
    return {
      kind: 'died',
      reason: `You reached ${DEATH_AGE} with ${state.coins.toLocaleString('en-US')} coins. The million slipped away.`,
    };
  }

  if (isBankrupt()) {
    return {
      kind: 'bankrupt',
      reason: 'You have no seeds, nothing to harvest, and not enough coins for a seed pack.',
    };
  }

  return null;
}

// Evaluated from render. Waits while the sale screen is open so the summary is always shown first.
function checkForGameOver() {
  if (state.gameOver) {
    return true;
  }

  if (state.market.saleScreenOpen) {
    return false;
  }

  const result = getGameEndResult();
  if (!result) {
    return false;
  }

  state.gameOver = true;
  state.gameResult = result.kind;
  state.gameOverReason = result.reason;
  state.marketOpen = false;
  state.shopOpen = false;
  state.market.simulating = false;
  recordGameEnd();
  return true;
}

function resetDragState() {
  dragState.active = false;
  dragState.slotIndex = null;
  dragState.preview = null;
  dragState.pointer = null;
  dragState.overBoard = false;
}

// Autosave: called from render, so every committed change is stored. Finished games aren't saved.
function saveGame() {
  if (state.gameOver) {
    return;
  }

  writeStored(SAVE_KEY, serializeGame(state));
}

// A finished run clears the save and may set a new best result.
function recordGameEnd() {
  removeStored(SAVE_KEY);
  const best = readStored(BEST_KEY) ?? {};
  if (state.gameResult === 'won' && (best.millionaireAge == null || state.age < best.millionaireAge)) {
    best.millionaireAge = state.age;
  }
  best.highestCoins = Math.max(best.highestCoins ?? 0, state.coins);
  writeStored(BEST_KEY, best);
}

function startNewGame() {
  removeStored(SAVE_KEY);
  Object.assign(state, createInitialGameState());
  resetDragState();
  uiState.screen = 'game';
  uiState.confirmNewGame = false;
  render();
}

function continueGame() {
  const restored = restoreGame(readStored(SAVE_KEY), createInitialGameState());
  if (!restored) {
    startNewGame();
    return;
  }

  Object.assign(state, restored);
  resetDragState();
  uiState.screen = 'game';
  uiState.confirmNewGame = false;

  // The sale result was fixed when selling started; settle it now instead of letting a reload re-roll it.
  if (state.market.simulating && state.market.activeSimulation) {
    state.market.saleScreenOpen = true;
    finalizeMarketSimulation(MARKET_LOCATIONS[state.market.location], state.market.activeSimulation);
    return;
  }

  render();
}

function openMainMenu() {
  if (state.market.simulating) {
    return;
  }

  saveGame();
  resetDragState();
  state.dragPreview = null;
  uiState.screen = 'menu';
  uiState.confirmNewGame = false;
  render();
}

function clearBoardForReturn() {
  state.grid = createGrid(GRID_SIZE, GRID_SIZE);
  state.highlightedGroup = [];
  state.dragPreview = null;
  state.activeSlotIndex = null;
  state.hand = createHandState(state.inventory);
  state.harvestFeedback = '';
  state.harvestFlash = null;
  state.combo = 0;
  state.market.saleReport = null;
  state.market.activeSimulation = null;
  state.market.activeSelectedCrops = [];
  state.market.skipAnimation = false;
  dragState.active = false;
  dragState.slotIndex = null;
  dragState.preview = null;
}

function nextTetrominoInBag(inventory) {
  const bag = [...state.hand.bag];
  const nextBag = ensureBagHasShapes(bag);
  const shapeType = nextBag.shift();
  const tetromino = createTetrominoFromShape(shapeType, inventory);
  return { tetromino, bag: nextBag };
}

// After the current block is placed, the next block moves up and a new next block is drawn.
function advanceHand() {
  state.hand.slots[CURRENT_SLOT] = state.hand.slots[NEXT_SLOT];
  const available = getUnreservedInventory(state.inventory, [state.hand.slots[CURRENT_SLOT], state.hand.hold]);
  const { tetromino, bag } = nextTetrominoInBag(available);
  state.hand.slots[NEXT_SLOT] = tetromino;
  state.hand.bag = bag;
}

// Hold slot upgrade: park the current block. With an empty hold the hand moves on to the next
// block; otherwise the current and held blocks trade places.
function holdBlock() {
  if (!state.upgrades.hold || dragState.active) {
    return;
  }

  const current = state.hand.slots[CURRENT_SLOT];
  if (state.hand.hold) {
    state.hand.slots[CURRENT_SLOT] = state.hand.hold;
    state.hand.hold = current;
  } else {
    state.hand.hold = current;
    advanceHand();
  }
  render();
}

function swapHandBlocks() {
  if (dragState.active) {
    return;
  }

  const { slots } = state.hand;
  [slots[CURRENT_SLOT], slots[NEXT_SLOT]] = [slots[NEXT_SLOT], slots[CURRENT_SLOT]];
  render();
}

function getSizeBonus(tileCount) {
  return HARVEST_SIZE_BONUSES.find((bonus) => tileCount >= bonus.minSize) ?? null;
}

function getSeedLevelMultiplier(cropKey) {
  return 1 + SEED_LEVEL_YIELD_BONUS * Math.max(0, getCropSeedLevel(cropKey) - 1);
}

// `combo` is the group's position in the current harvest streak (1 = first group, no bonus).
function getComboMultiplier(combo) {
  return Math.min(COMBO_MAX_MULTIPLIER, 1 + COMBO_STEP_BONUS * Math.max(0, combo - 1));
}

// Units harvested from one connected group of `tileCount` tiles. Emergency harvests get no bonuses.
function getHarvestYield(cropKey, tileCount, { withBonuses = true, combo = 1 } = {}) {
  if (!withBonuses) {
    return tileCount;
  }

  const sizeMultiplier = getSizeBonus(tileCount)?.multiplier ?? 1;
  return Math.round(tileCount * sizeMultiplier * getSeedLevelMultiplier(cropKey) * getComboMultiplier(combo));
}

// Harvesting is free: crops move from the field into the harvested stock for market,
// and their cells are cleared. Each bonus-eligible group extends the combo.
function harvestGroups(groups, { withBonuses }) {
  const harvested = {};
  const sizeLabels = new Set();
  const flashCells = [];

  for (const group of groups) {
    if (withBonuses) {
      state.combo += 1;
      const sizeBonus = getSizeBonus(group.cells.length);
      if (sizeBonus) {
        sizeLabels.add(`${sizeBonus.label} ×${sizeBonus.multiplier}`);
      }
    }

    const quantity = getHarvestYield(group.cropType, group.cells.length, { withBonuses, combo: state.combo });
    harvested[group.cropType] = (harvested[group.cropType] ?? 0) + quantity;
    flashCells.push(...group.cells.map((cell) => ({ ...cell, cropType: group.cropType })));
    state.grid = clearConnectedCells(state.grid, group.cells);
  }

  for (const [cropType, quantity] of Object.entries(harvested)) {
    state.cropInventory[cropType] = (state.cropInventory[cropType] ?? 0) + quantity;
  }

  const comboMultiplier = withBonuses ? getComboMultiplier(state.combo) : 1;
  return { harvested, sizeLabels: [...sizeLabels], comboMultiplier, flashCells };
}

function describeHarvest(prefix, { harvested, sizeLabels, comboMultiplier }) {
  const parts = Object.entries(harvested)
    .map(([cropType, quantity]) => `${CROP_EMOJIS[cropType] ?? '🌱'} ${quantity}`);
  parts.push(...sizeLabels);
  if (comboMultiplier > 1) {
    parts.push(`Combo ×${Number(comboMultiplier.toFixed(1))}`);
  }
  return `${prefix}: ${parts.join(' · ')}`;
}

// Remembers what was just harvested so the board can play a short pop animation.
function flashHarvest(result) {
  const total = Object.values(result.harvested).reduce((sum, quantity) => sum + quantity, 0);
  state.harvestFlash = {
    key: Date.now(),
    cells: result.flashCells,
    text: `+${total}${result.comboMultiplier > 1 ? ` · Combo ×${Number(result.comboMultiplier.toFixed(1))}` : ''}`,
  };
}

function scheduleHarvestFlashClear() {
  const key = state.harvestFlash?.key;
  if (!key || typeof setTimeout !== 'function') {
    return;
  }

  setTimeout(() => {
    if (state.harvestFlash?.key === key) {
      state.harvestFlash = null;
      render();
    }
  }, HARVEST_FLASH_MS);
}

// Runs after every placement: any group that has grown large enough is harvested.
// A placement that harvests nothing breaks the combo.
function autoHarvest() {
  const groups = findAllConnectedGroups(state.grid)
    .filter((group) => group.cells.length >= AUTO_HARVEST_MIN_GROUP_SIZE);

  if (groups.length === 0) {
    state.combo = 0;
    return;
  }

  const result = harvestGroups(groups, { withBonuses: true });
  state.harvestFeedback = describeHarvest('Auto-harvested', result);
  flashHarvest(result);
}

function isFieldEmpty() {
  return state.grid.every((row) => row.every((cell) => !cell));
}

// One-shot joker for a field clogged with small groups: harvests everything, without bonuses.
function emergencyHarvest() {
  if (state.emergencyHarvests <= 0 || isFieldEmpty()) {
    return;
  }

  const groups = findAllConnectedGroups(state.grid);
  state.emergencyHarvests -= 1;
  state.combo = 0;
  const result = harvestGroups(groups, { withBonuses: false });
  state.harvestFeedback = describeHarvest('Emergency harvest', result);
  flashHarvest(result);
  render();
  scheduleHarvestFlashClear();
}

function getEmergencyRestockCost(coins = state.coins) {
  return Math.max(EMERGENCY_HARVEST_COST, Math.round(coins * EMERGENCY_HARVEST_COST_SHARE));
}

function restockEmergencyHarvest() {
  const cost = getEmergencyRestockCost();
  if (state.emergencyHarvests >= EMERGENCY_HARVEST_MAX_CHARGES || state.coins < cost) {
    return false;
  }

  state.coins -= cost;
  state.emergencyHarvests += 1;
  state.shopFeedback = { message: 'Emergency harvest restocked', kind: 'success' };
  render();
  return true;
}

function rotateSelectedTetromino(slotIndex = state.activeSlotIndex ?? dragState.slotIndex) {
  if (slotIndex !== CURRENT_SLOT) {
    return;
  }

  const currentTetromino = state.hand.slots[slotIndex];
  if (!currentTetromino || !currentTetromino.cells || currentTetromino.cells.length === 0) {
    return;
  }

  const nextTetromino = cloneTetromino(currentTetromino);
  nextTetromino.cells = rotateCells(nextTetromino.cells);
  state.hand.slots[slotIndex] = nextTetromino;

  if (dragState.active && dragState.slotIndex === slotIndex
    && state.dragPreview && state.dragPreview.row !== undefined && state.dragPreview.col !== undefined) {
    state.dragPreview.tetromino = cloneTetromino(nextTetromino);
    state.dragPreview.valid = canPlaceShape(state.grid, state.dragPreview.tetromino, state.dragPreview.row, state.dragPreview.col);
  }

  render();
}

function getBoardCellFromPointer(event) {
  const board = document.querySelector('.board-grid');
  if (!board) {
    return null;
  }

  const rect = board.getBoundingClientRect();
  const fieldSize = state.grid.length;
  const size = rect.width / fieldSize;
  const x = Math.floor((event.clientX - rect.left) / size);
  const y = Math.floor((event.clientY - rect.top) / size);

  if (!isInsideGrid(y, x, fieldSize, fieldSize)) {
    return null;
  }

  return { row: y, col: x };
}

function startDrag(slotIndex, event) {
  if (slotIndex !== CURRENT_SLOT) {
    return;
  }

  const tetromino = state.hand.slots[slotIndex];
  if (!tetromino || !tetromino.cells || tetromino.cells.length === 0) {
    return;
  }

  state.highlightedGroup = [];

  event.preventDefault();
  state.activeSlotIndex = slotIndex;
  dragState.active = true;
  dragState.slotIndex = slotIndex;
  dragState.preview = null;
  dragState.pointer = { x: event.clientX, y: event.clientY };
  dragState.overBoard = false;
  state.dragPreview = null;

  updateDragPreview(event);
  render();
}

function updateDragPreview(event) {
  if (!dragState.active || dragState.slotIndex === null) {
    return;
  }

  dragState.pointer = { x: event.clientX, y: event.clientY };
  const board = document.querySelector('.board-grid');
  if (!board) {
    dragState.overBoard = false;
    state.dragPreview = null;
    render();
    return;
  }

  const rect = board.getBoundingClientRect();
  const boardCells = board.querySelectorAll('.board-cell');
  const firstCell = boardCells[0]?.getBoundingClientRect();
  const nextCell = boardCells[1]?.getBoundingClientRect();
  const nextRowCell = boardCells[state.grid[0].length]?.getBoundingClientRect();

  if (firstCell && nextCell && nextRowCell) {
    const columnStep = nextCell.left - firstCell.left;
    const rowStep = nextRowCell.top - firstCell.top;
    dragState.boardMetrics = {
      cellWidth: firstCell.width,
      cellHeight: firstCell.height,
      columnStep,
      rowStep,
      gapX: columnStep - firstCell.width,
      gapY: rowStep - firstCell.height,
      offsetX: firstCell.left - rect.left,
      offsetY: firstCell.top - rect.top,
    };
    dragState.tileSize = Math.max(32, Math.min(60, firstCell.width));
  }

  const metrics = dragState.boardMetrics;
  const columnStep = metrics?.columnStep ?? rect.width / state.grid[0].length;
  const rowStep = metrics?.rowStep ?? rect.height / state.grid.length;
  const pointerX = event.clientX - rect.left;
  const pointerY = event.clientY - rect.top;

  if (pointerX < 0 || pointerY < 0 || pointerX > rect.width || pointerY > rect.height) {
    dragState.overBoard = false;
    state.dragPreview = null;
    render();
    return;
  }

  dragState.overBoard = true;
  const tetromino = cloneTetromino(state.hand.slots[dragState.slotIndex]);
  const minRow = Math.min(...tetromino.cells.map((cell) => cell.row));
  const maxRow = Math.max(...tetromino.cells.map((cell) => cell.row));
  const minCol = Math.min(...tetromino.cells.map((cell) => cell.col));
  const maxCol = Math.max(...tetromino.cells.map((cell) => cell.col));
  const shapeHeight = maxRow - minRow + 1;
  const shapeWidth = maxCol - minCol + 1;

  const centerCol = (pointerX - (metrics?.offsetX ?? 0)) / columnStep - 0.5;
  const centerRow = (pointerY - (metrics?.offsetY ?? 0)) / rowStep - 0.5;

  const originRow = Math.round(centerRow - (shapeHeight - 1) / 2) - minRow;
  const originCol = Math.round(centerCol - (shapeWidth - 1) / 2) - minCol;

  const valid = canPlaceShape(state.grid, tetromino, originRow, originCol);

  state.dragPreview = {
    tetromino,
    row: originRow,
    col: originCol,
    valid,
  };

  dragState.preview = state.dragPreview;
  render();
}

function finishDrag(event) {
  if (!dragState.active || dragState.slotIndex === null) {
    return;
  }

  const tetromino = state.hand.slots[dragState.slotIndex];
  const previewPlacement = state.dragPreview && state.dragPreview.row !== undefined && state.dragPreview.col !== undefined
    ? { row: state.dragPreview.row, col: state.dragPreview.col }
    : getBoardCellFromPointer(event);

  if (previewPlacement) {
    const placedGrid = placeShapeOnGrid(state.grid, tetromino, previewPlacement.row, previewPlacement.col);

    if (placedGrid) {
      const inventoryUpdated = consumeTetrominoFromInventory(state.inventory, tetromino);
      if (inventoryUpdated) {
        state.grid = placedGrid;
        state.harvestFeedback = '';
        autoHarvest();
        advanceHand();
        scheduleHarvestFlashClear();
      }
    }
  }

  dragState.active = false;
  dragState.slotIndex = null;
  dragState.preview = null;
  dragState.pointer = null;
  dragState.overBoard = false;
  state.dragPreview = null;
  state.activeSlotIndex = null;
  render();
}

function renderCropPixelArt(cropType, opacity = 1) {
  const emoji = CROP_EMOJIS[cropType] ?? '🌱';

  return `
    <span class="crop-emoji" style="opacity:${opacity}; filter: drop-shadow(0 1px 0 rgba(0,0,0,0.2));">
      ${emoji}
    </span>
  `;
}

function renderBoard() {
  const cells = [];

  for (let row = 0; row < state.grid.length; row += 1) {
    for (let col = 0; col < state.grid[row].length; col += 1) {
      const crop = state.grid[row][col];
      const previewCell = state.dragPreview && state.dragPreview.tetromino.cells.find((cell) => row === state.dragPreview.row + cell.row && col === state.dragPreview.col + cell.col);
      const isPreview = !!previewCell;
      const isValidPreview = isPreview && state.dragPreview.valid;
      const isInvalidPreview = isPreview && !state.dragPreview.valid;
      const cellClass = [
        'board-cell',
        crop ? 'filled' : '',
        state.highlightedGroup.some((cell) => cell.row === row && cell.col === col) ? 'highlighted' : '',
        isValidPreview ? 'preview-valid' : '',
        isInvalidPreview ? 'preview-invalid' : '',
        isPreview ? 'preview-cell' : '',
      ].filter(Boolean).join(' ');

      const artCrop = crop || previewCell?.cropType || null;
      // A just-harvested (now empty) tile briefly shows its crop popping away.
      const poppedCell = !artCrop && state.harvestFlash?.cells.find((cell) => cell.row === row && cell.col === col);
      const artMarkup = artCrop
        ? renderCropPixelArt(artCrop, isPreview ? 0.8 : 1)
        : poppedCell ? `<span class="harvest-pop">${renderCropPixelArt(poppedCell.cropType)}</span>` : '';

      cells.push(`
        <button
          class="${cellClass}"
          data-row="${row}"
          data-col="${col}"
          style="opacity:${isPreview ? 0.8 : 1};"
          title="${crop || previewCell?.cropType || 'Empty'}"
          type="button"
        >
          ${artMarkup}
        </button>
      `);
    }
  }

  const burst = state.harvestFlash ? `<div class="harvest-burst" aria-hidden="true">${state.harvestFlash.text}</div>` : '';
  return `<div class="board-grid" style="grid-template-columns:repeat(${state.grid[0].length}, minmax(36px, 1fr));">${cells.join('')}${renderBoardDragPreview()}${burst}</div>`;
}

function renderBoardDragPreview() {
  const preview = state.dragPreview;
  const metrics = dragState.boardMetrics;
  if (!preview || !metrics) {
    return '';
  }

  const minRow = Math.min(...preview.tetromino.cells.map((cell) => cell.row));
  const minCol = Math.min(...preview.tetromino.cells.map((cell) => cell.col));
  const maxRow = Math.max(...preview.tetromino.cells.map((cell) => cell.row));
  const maxCol = Math.max(...preview.tetromino.cells.map((cell) => cell.col));
  const rows = maxRow - minRow + 1;
  const columns = maxCol - minCol + 1;
  const tiles = preview.tetromino.cells.map((cell) => `
    <div
      class="board-preview-cell ${preview.valid ? 'valid' : 'invalid'}"
      style="grid-row:${cell.row - minRow + 1}; grid-column:${cell.col - minCol + 1}; width:${metrics.cellWidth}px; height:${metrics.cellHeight}px;"
    >
      ${cell.cropType ? renderCropPixelArt(cell.cropType, 0.8) : ''}
    </div>
  `).join('');

  return `
    <div
      class="board-drag-preview"
      style="left:${metrics.offsetX + (preview.col + minCol) * metrics.columnStep}px; top:${metrics.offsetY + (preview.row + minRow) * metrics.rowStep}px; grid-template-columns:repeat(${columns}, ${metrics.cellWidth}px); grid-template-rows:repeat(${rows}, ${metrics.cellHeight}px); column-gap:${metrics.gapX}px; row-gap:${metrics.gapY}px;"
      aria-hidden="true"
    >
      ${tiles}
    </div>
  `;
}

// Draws a block centred in a card. The mini grid has 8x8 half-size tracks and each block cell
// spans 2, so any shape can be centred exactly.
function renderMiniBlock(tetromino) {
  const cellsOf = tetromino?.cells ?? [];
  const shapeWidth = Math.max(0, ...cellsOf.map((cell) => cell.col + 1));
  const shapeHeight = Math.max(0, ...cellsOf.map((cell) => cell.row + 1));
  const colOffset = 4 - shapeWidth;
  const rowOffset = 4 - shapeHeight;
  return cellsOf.map((cell) => `
    <div
      class="slot-cell filled"
      style="grid-row:${rowOffset + cell.row * 2 + 1} / span 2; grid-column:${colOffset + cell.col * 2 + 1} / span 2;"
    >
      ${cell.cropType ? renderCropPixelArt(cell.cropType, 1) : ''}
    </div>
  `).join('');
}

function renderHoldCard() {
  const held = state.hand.hold;
  return `
    <div class="tetromino-card hold-card" data-slot-index="hold">
      <div class="shape-name">Hold</div>
      <div class="mini-grid">${renderMiniBlock(held)}</div>
      <button
        id="hand-hold-button"
        type="button"
        class="swap-button hold-button"
        title="${held ? 'Swap with current: trade the current block with the held one' : 'Hold current: park the current block for later'}"
        aria-label="${held ? 'Swap with current' : 'Hold current'}"
      >${held ? '⇄' : '📥'}</button>
    </div>
  `;
}

function renderHandSlots() {
  const cards = state.hand.slots
    .map((tetromino, index) => {
      return `
        <div class="tetromino-card ${index === NEXT_SLOT ? 'next-card' : ''} ${state.activeSlotIndex === index ? 'selected' : ''}" data-slot-index="${index}">
          <div class="shape-name">${index === CURRENT_SLOT ? 'Current' : 'Next'}</div>
          <div class="mini-grid">${renderMiniBlock(tetromino)}</div>
        </div>
      `;
    });

  return `
    ${cards[CURRENT_SLOT]}
    <button id="hand-next-button" type="button" class="swap-button" title="Swap the current block with the next one" aria-label="Swap">🔁</button>
    ${cards[NEXT_SLOT]}
    ${state.upgrades.hold ? renderHoldCard() : ''}
  `;
}

function renderNextGoal() {
  const goal = getNextGoal();
  const isCoinGoal = goal.cost === GOAL_COINS;
  const title = goal.ready && !isCoinGoal
    ? `You can afford ${goal.label}. Unlock it in the shop after your next sale.`
    : `Save up ${goal.cost.toLocaleString('en-US')} coins for ${goal.label}.`;
  const value = goal.ready && !isCoinGoal
    ? 'ready'
    : `${state.coins.toLocaleString('en-US')} / ${goal.cost.toLocaleString('en-US')}`;

  return `
    <div class="stat goal-stat ${goal.ready ? 'ready' : ''}" title="${title}">
      <span>Next: ${goal.label}</span>
      <strong>${value}</strong>
      <div class="goal-progress" aria-hidden="true"><div style="width:${Math.round(goal.progress * 100)}%"></div></div>
    </div>
  `;
}

function renderEmergencyButton() {
  if (state.marketOpen || state.shopOpen) {
    return '';
  }

  const hasCharge = state.emergencyHarvests > 0;
  const title = hasCharge
    ? 'Harvest the entire field. Can be used once; restock it in the shop.'
    : 'Used. Restock it in the shop after selling.';

  return `
    <button
      id="emergency-harvest-button"
      type="button"
      class="emergency-button"
      title="${title}"
      ${!hasCharge || isFieldEmpty() ? 'disabled' : ''}
    >
      <span class="emergency-emoji" aria-hidden="true">🚨</span>
      <span class="emergency-label">${hasCharge ? 'Emergency' : 'Used'}</span>
    </button>
  `;
}

function renderDragGhost() {
  if (!dragState.active || dragState.overBoard || !dragState.pointer) {
    return '';
  }

  const tetromino = state.hand.slots[dragState.slotIndex];
  if (!tetromino?.cells?.length) {
    return '';
  }

  const minRow = Math.min(...tetromino.cells.map((cell) => cell.row));
  const minCol = Math.min(...tetromino.cells.map((cell) => cell.col));
  const maxRow = Math.max(...tetromino.cells.map((cell) => cell.row));
  const maxCol = Math.max(...tetromino.cells.map((cell) => cell.col));
  const tileSize = dragState.tileSize;
  const gap = 4;
  const columns = maxCol - minCol + 1;
  const rows = maxRow - minRow + 1;
  const width = columns * tileSize + (columns - 1) * gap;
  const height = rows * tileSize + (rows - 1) * gap;
  const tiles = tetromino.cells.map((cell) => `
    <div
      class="drag-ghost-cell"
      style="grid-row:${cell.row - minRow + 1}; grid-column:${cell.col - minCol + 1}; width:${tileSize}px; height:${tileSize}px;"
    >
      ${cell.cropType ? renderCropPixelArt(cell.cropType) : ''}
    </div>
  `).join('');

  return `
    <div
      class="drag-ghost"
      style="left:${dragState.pointer.x}px; top:${dragState.pointer.y}px; width:${width}px; height:${height}px; grid-template-columns:repeat(${columns}, ${tileSize}px); grid-template-rows:repeat(${rows}, ${tileSize}px); gap:${gap}px;"
      aria-hidden="true"
    >
      ${tiles}
    </div>
  `;
}

function describeContract(contract) {
  return `${CROP_EMOJIS[contract.crop] ?? '🌱'} ${contract.quantity} ${contract.crop} → ${MARKET_LOCATIONS[contract.locationKey].label} · +${contract.reward.toLocaleString('en-US')}`;
}

function describeVisits(count) {
  return `${count} visit${count === 1 ? '' : 's'}`;
}

// ---------- Seed shop ----------

// The crop whose seed and upgrade actions the shop shows. UI-only, not saved.
function getShopCrop() {
  const selected = uiState.shopCrop;
  if (selected && getCropSeedLevel(selected) > 0) {
    return selected;
  }
  return CROP_KEYS.find((crop) => getCropSeedLevel(crop) > 0) ?? CROP_KEYS[0];
}

// A square shop button: emoji, name and a short status or price line.
function renderShopTile({ icon, name, meta, action, data = '', classes = [], title = '', badge = '', disabled = false }) {
  return `
    <button
      type="button"
      class="shop-tile ${classes.filter(Boolean).join(' ')}"
      ${action ? `data-shop-action="${action}"` : ''}
      ${data}
      ${title ? `title="${title}"` : ''}
      ${disabled ? 'disabled' : ''}
    >
      ${badge ? `<span class="shop-tile-badge" aria-hidden="true">${badge}</span>` : ''}
      <span class="shop-tile-icon" aria-hidden="true">${icon}</span>
      <span class="shop-tile-name">${name}</span>
      <span class="shop-tile-meta">${meta}</span>
    </button>
  `;
}

function renderCropTiles(goalLabel) {
  const selected = getShopCrop();
  // Cheapest unlock first, so the row reads as the crop progression.
  const crops = [...CROP_KEYS].sort((a, b) => getUnlockCost(a) - getUnlockCost(b));

  return crops.map((crop) => {
    const config = getCropSeedConfig(crop);
    const level = getCropSeedLevel(crop);
    if (level > 0) {
      return renderShopTile({
        icon: CROP_EMOJIS[crop],
        name: config.label,
        meta: `Lv ${level}`,
        action: 'select-crop',
        data: `data-shop-crop="${crop}"`,
        classes: [crop === selected && 'selected'],
        title: `${config.label}: seeds and upgrades`,
      });
    }

    const cost = getUnlockCost(crop);
    return renderShopTile({
      icon: CROP_EMOJIS[crop],
      name: config.label,
      meta: `Unlock · ${cost.toLocaleString('en-US')}`,
      action: 'unlock-crop',
      data: `data-shop-crop="${crop}"`,
      classes: ['locked', state.coins < cost && 'unaffordable', goalLabel === config.label && 'goal'],
      title: `Unlock ${config.label} for ${cost.toLocaleString('en-US')} coins`,
      badge: '🔒',
    });
  }).join('');
}

// Seed and upgrade actions for the selected crop (a square tile has no room for two actions).
function renderCropActions() {
  const crop = getShopCrop();
  const level = getCropSeedLevel(crop);
  if (level === 0) {
    return '';
  }

  const config = getCropSeedConfig(crop);
  const packCost = getCropSeedPrice(crop);
  const upgradeCost = getUpgradeCost(crop);
  const multiplier = (value) => Number(value.toFixed(2));

  return `
    <div class="shop-crop-actions">
      <span class="shop-crop-summary">
        ${CROP_EMOJIS[crop]} <strong>${config.label}</strong> · Lv ${level} · 🌱 ${state.inventory[crop] ?? 0} seeds · yield ×${multiplier(getSeedLevelMultiplier(crop))}
      </span>
      <button type="button" class="shop-button ${state.coins < packCost ? 'unaffordable' : ''}" data-shop-action="buy-seed" data-shop-crop="${crop}">
        🌱 Buy ${getCropSeedPackSize(crop)} seeds · ${packCost.toLocaleString('en-US')}
      </button>
      ${upgradeCost !== null ? `
        <button type="button" class="shop-button secondary ${state.coins < upgradeCost ? 'unaffordable' : ''}" data-shop-action="upgrade-crop" data-shop-crop="${crop}">
          ⬆ Upgrade to Lv ${level + 1} · ${upgradeCost.toLocaleString('en-US')} · yield ×${multiplier(getSeedLevelMultiplier(crop) + SEED_LEVEL_YIELD_BONUS)}
        </button>
      ` : '<span class="shop-maxed">Max level</span>'}
    </div>
  `;
}

const MARKET_ICONS = { town: '🏘️', city: '🏙️' };

function renderFarmTiles(goalLabel) {
  const holdTile = state.upgrades.hold
    ? renderShopTile({ icon: '📥', name: 'Hold slot', meta: 'Owned', classes: ['owned'], disabled: true })
    : renderShopTile({
      icon: '📥',
      name: 'Hold slot',
      meta: `Unlock · ${HOLD_SLOT_COST.toLocaleString('en-US')}`,
      action: 'buy-hold',
      classes: [state.coins < HOLD_SLOT_COST && 'unaffordable', goalLabel === 'Hold slot' && 'goal'],
      title: 'A third hand card to park a block for later',
    });

  const marketTiles = Object.entries(MARKET_LOCATIONS)
    .filter(([, location]) => location.unlockCost > 0)
    .map(([locationKey, location]) => (isMarketUnlocked(locationKey)
      ? renderShopTile({ icon: MARKET_ICONS[locationKey] ?? '🏪', name: location.label, meta: 'Open', classes: ['owned'], disabled: true })
      : renderShopTile({
        icon: MARKET_ICONS[locationKey] ?? '🏪',
        name: location.label,
        meta: `Unlock · ${location.unlockCost.toLocaleString('en-US')}`,
        action: 'unlock-market',
        data: `data-shop-market="${locationKey}"`,
        classes: [state.coins < location.unlockCost && 'unaffordable', goalLabel === `${location.label} market` && 'goal'],
        title: `Unlock the ${location.label} market`,
      })))
    .join('');

  const restockCost = getEmergencyRestockCost();
  const emergencyTile = state.emergencyHarvests >= EMERGENCY_HARVEST_MAX_CHARGES
    ? renderShopTile({ icon: '🚨', name: 'Emergency', meta: 'Ready', classes: ['owned'], disabled: true })
    : renderShopTile({
      icon: '🚨',
      name: 'Emergency',
      meta: `Restock · ${restockCost.toLocaleString('en-US')}`,
      action: 'restock-emergency',
      classes: [state.coins < restockCost && 'unaffordable'],
      title: `Costs ${Math.round(EMERGENCY_HARVEST_COST_SHARE * 100)}% of your coins (at least ${EMERGENCY_HARVEST_COST})`,
    });

  const barnUpgrade = getNextBarnUpgrade();
  const barnTile = barnUpgrade
    ? renderShopTile({
      icon: '🛖',
      name: `Barn ${getBarnCapacity()}`,
      meta: `→ ${barnUpgrade.capacity} · ${barnUpgrade.cost.toLocaleString('en-US')}`,
      action: 'upgrade-barn',
      classes: [state.coins < barnUpgrade.cost && 'unaffordable', goalLabel === `Barn ${barnUpgrade.capacity}` && 'goal'],
      title: `Keep up to ${barnUpgrade.capacity} crops for later (now ${getBarnCapacity()})`,
    })
    : renderShopTile({ icon: '🛖', name: `Barn ${getBarnCapacity()}`, meta: 'Max size', classes: ['owned'], disabled: true });

  return holdTile + barnTile + marketTiles + emergencyTile;
}

function renderContractsGroup() {
  const { active, offers } = state.contracts;
  const isFull = active.length >= CONTRACT_MAX_ACTIVE;

  return `
    <h3>📜 Contracts (${active.length}/${CONTRACT_MAX_ACTIVE})</h3>
    ${offers.length ? offers.map((offer) => `
      <div class="contract-offer">
        <span>${describeContract(offer)} · within ${describeVisits(offer.visits)}</span>
        <button
          type="button"
          class="shop-button secondary ${isFull ? 'unaffordable' : ''}"
          data-shop-action="accept-contract"
          data-contract-id="${offer.id}"
          ${isFull ? 'title="You already have the maximum number of contracts"' : ''}
        >
          Accept
        </button>
      </div>
    `).join('') : '<p class="contract-empty">New offers arrive after your next market visit.</p>'}
    ${active.map((contract) => `
      <div class="contract-line">Active: ${describeContract(contract)} · ${describeVisits(getContractVisitsLeft(contract))} left</div>
    `).join('')}
  `;
}

function renderShopPanel() {
  if (!state.shopOpen) {
    return '';
  }

  const goalLabel = getNextGoal().label;

  return `
    <div class="shop-screen" role="dialog" aria-modal="true" aria-label="Seed shop">
      <div class="shop-screen-panel">
        <header class="shop-header">
          <h2>🛒 Seed Shop</h2>
          <span class="shop-coins">💰 ${state.coins.toLocaleString('en-US')}</span>
          <button type="button" id="shop-close" class="sell-button shop-done">Done ▶</button>
        </header>

        ${state.shopFeedback ? `<div class="shop-feedback ${state.shopFeedback.kind}">${state.shopFeedback.message}</div>` : ''}

        <section class="shop-group">
          <h3>🌱 Crops</h3>
          <div class="shop-tiles">${renderCropTiles(goalLabel)}</div>
          ${renderCropActions()}
        </section>

        <div class="shop-columns">
          <section class="shop-group">
            <h3>🏡 Farm &amp; Markets</h3>
            <div class="shop-tiles">${renderFarmTiles(goalLabel)}</div>
          </section>
          <section class="shop-group">${renderContractsGroup()}</section>
        </div>
      </div>
    </div>
  `;
}

function canStartSelling() {
  return !state.market.simulating && getSellingBlocker() === null;
}

function renderMarketPanel() {
  const crop = state.market.crop || 'tomato';
  const profile = getMarketLocationProfile();
  const productPool = getMarketProductPool(state.market.location);
  const harvestedCrops = CROP_KEYS.filter((item) => (state.cropInventory[item] ?? 0) > 0);
  const variety = getVarietyCount(state.market.location);
  const sellingBlocker = getSellingBlocker();
  const sellDisabled = state.market.simulating || !canStartSelling();

  return `
    <div class="market-modal-backdrop ${state.marketOpen ? 'open' : ''}">
      <div class="market-modal-panel" role="dialog" aria-modal="true">
        <div class="market-header">
          <h2>Marketplace</h2>
          <button type="button" id="market-close" class="close-button">×</button>
        </div>

        <div class="market-form">
          <label>
            <span>Location</span>
            <select id="market-location" ${state.market.simulating ? 'disabled' : ''}>
              ${Object.entries(MARKET_LOCATIONS).map(([key, location]) => `
                <option value="${key}" ${state.market.location === key ? 'selected' : ''} ${isMarketUnlocked(key) ? '' : 'disabled'}>
                  ${location.label}${isMarketUnlocked(key) ? '' : ` (locked · ${location.unlockCost})`}
                </option>
              `).join('')}
            </select>
          </label>

          <div class="market-inventory-list">
            ${harvestedCrops.length
              ? harvestedCrops.map((item) => {
                  const price = Number(state.market.prices[item] ?? CROP_BASE_PRICES[item]);
                  const isActive = crop === item;
                  const soldHere = productPool.includes(item);
                  const forecast = soldHere ? getDemandForecast(state.market.location, item, price) : null;

                  return `
                    <div class="sale-row market-crop-row ${isActive ? 'active' : ''}" data-market-crop-row="${item}">
                      <div class="sale-row-label-wrap">
                        <div class="sale-row-label">
                          <button type="button" class="market-crop-select" data-market-crop="${item}" ${state.market.simulating ? 'disabled' : ''}>
                            <span class="sale-swatch" style="background:${CROP_COLORS[item]};"></span>
                            <span>${item}</span>
                          </button>
                        </div>
                        <div class="market-crop-counts">
                          <span class="market-crop-count">Harvest: ${state.cropInventory[item]}</span>
                        </div>
                      </div>

                      <div class="market-crop-controls">
                        <div class="selector-row small-inline barn-row">
                          <button type="button" class="small-button" data-market-crop="${item}" data-market-action="keep-dec" ${state.market.simulating ? 'disabled' : ''} aria-label="Keep fewer">-</button>
                          <span>🛖 Keep for later: <strong>${state.market.keep[item] ?? 0}</strong></span>
                          <button type="button" class="small-button" data-market-crop="${item}" data-market-action="keep-inc" ${state.market.simulating ? 'disabled' : ''} aria-label="Keep more">+</button>
                        </div>
                        ${soldHere ? `
                          <div class="selector-row small-inline">
                            <button type="button" class="small-button" data-market-crop="${item}" data-market-action="price-dec" ${state.market.simulating ? 'disabled' : ''}>-</button>
                            <span>Price: <strong>${price}</strong> <span class="price-change">${describePriceChange(price, CROP_BASE_PRICES[item])}</span></span>
                            <button type="button" class="small-button" data-market-crop="${item}" data-market-action="price-inc" ${state.market.simulating ? 'disabled' : ''}>+</button>
                          </div>
                          <p class="market-forecast" title="Expected for this market's lowest and highest traffic">
                            📊 ${formatRange(forecast.wanted)} customers want ${item} · ~${Math.round(forecast.buyChance * 100)}% buy at this price
                          </p>
                        ` : `
                          <p class="empty-sale">${profile.label} customers don't buy ${item}. Any you don't keep will spoil.</p>
                        `}
                      </div>
                    </div>
                  `;
                }).join('')
              : '<p class="empty-sale">No harvested crops yet. Grow groups of 5+ or use Emergency.</p>'}
          </div>

          <div class="market-meta">
            <span title="Crops kept in the barn don't count">Variety: ${variety}/${profile.minVariety} crop types with ${MIN_UNITS_FOR_VARIETY}+ units on sale</span>
            <span>🛖 Barn: ${getKeptTotal()}/${getBarnCapacity()} kept for next visit · ${Math.round(BARN_SPOILAGE * 100)}% of each kept crop spoils</span>
            ${state.contracts.active
              .filter((contract) => contract.locationKey === state.market.location)
              .map((contract) => {
                const missing = contract.quantity - (state.cropInventory[contract.crop] ?? 0);
                return `<span class="contract-line ${missing <= 0 ? 'ready' : ''}">📜 Contract ${describeContract(contract)} · ${missing <= 0 ? 'delivered when you start selling' : `need ${missing} more`}</span>`;
              }).join('')}
            <span>Traffic: ${profile.trafficMin}-${profile.trafficMax}</span>
            <span>Crops you don't keep are sold here; leftovers spoil.</span>
          </div>

          <button type="button" id="market-start-selling" class="sell-button" ${sellDisabled ? 'disabled' : ''}>Start Selling</button>
          ${!state.market.simulating && !canSellAnywhere() ? `
            <button type="button" id="market-skip-season" class="shop-button secondary" title="No unlocked market accepts this harvest">
              Skip season (discard harvest and field)
            </button>
          ` : ''}
          <p class="market-summary">${sellingBlocker && !state.market.simulating ? sellingBlocker : state.market.lastSummary}</p>
        </div>
      </div>
    </div>
  `;
}

function formatRange({ min, max }) {
  return min === max ? `${min}` : `${min}–${max}`;
}

function describePriceChange(price, basePrice) {
  const change = Math.round((price / basePrice - 1) * 100);
  if (change === 0) {
    return 'base price';
  }
  return change > 0 ? `+${change}%` : `−${-change}%`;
}

function describeBestResult(best) {
  if (best?.millionaireAge != null) {
    return `Best: millionaire at age ${best.millionaireAge}`;
  }
  if (best?.highestCoins) {
    return `Best fortune: ${best.highestCoins.toLocaleString('en-US')} coins`;
  }
  return '';
}

function renderMainMenu() {
  const save = restoreGame(readStored(SAVE_KEY), createInitialGameState());
  const bestText = describeBestResult(readStored(BEST_KEY));
  const newGameLabel = save && uiState.confirmNewGame ? 'Replace your saved farm? Click again' : 'New Game';

  return `
    <div class="sale-screen menu-screen">
      <div class="sale-screen-panel game-over-panel">
        <div class="game-over-body">
          <div class="game-over-badge">🌾</div>
          <h2 class="game-over-title">Farming 101</h2>
          <p class="game-over-message">Grow crops, sell them, and become a millionaire before you turn ${DEATH_AGE}.</p>
          ${save ? `
            <button id="menu-continue" type="button" class="sell-button game-over-button">Continue</button>
            <p class="menu-save-summary">Age ${save.age} · ${save.season} · ${save.coins.toLocaleString('en-US')} coins · Round ${save.round}</p>
          ` : ''}
          <button id="menu-new-game" type="button" class="${save ? 'shop-button secondary' : 'sell-button'} game-over-button">${newGameLabel}</button>
          ${bestText ? `<p class="menu-best">${bestText}</p>` : ''}
        </div>
      </div>
    </div>
  `;
}

const GAME_ENDINGS = {
  won: { badge: '🏆', title: 'Millionaire!', button: 'Play again' },
  died: { badge: '🪦', title: 'Game Over', button: 'Retry' },
  bankrupt: { badge: '💸', title: 'Bankrupt', button: 'Retry' },
};

function renderGameOverScreen() {
  const ending = GAME_ENDINGS[state.gameResult] ?? GAME_ENDINGS.bankrupt;

  return `
    <div class="sale-screen game-over-screen">
      <div class="sale-screen-panel game-over-panel">
        <div class="sale-screen-header">
          <div>
            <p class="eyebrow">Farming 101</p>
            <h2>Session End</h2>
          </div>
        </div>

        <div class="game-over-body">
          <div class="game-over-badge">${ending.badge}</div>
          <h3 class="game-over-title">${ending.title}</h3>
          <p class="game-over-message">${state.gameOverReason}</p>
          <button id="game-over-retry" type="button" class="sell-button game-over-button">${ending.button}</button>
          <button id="game-over-menu" type="button" class="shop-button secondary game-over-button">Main menu</button>
        </div>
      </div>
    </div>
  `;
}

const SALE_TIP_ICONS = { up: '📈', ok: '✅', down: '📉', less: '📦' };

// The market stall with its stock, a day clock and the coins taken. Walkers and the numbers are
// updated each frame by updateSaleStage; this renders the current moment of the day.
function renderSaleStage() {
  const offers = state.market.activeSimulation?.sellers?.[0]?.assortment ?? {};
  const snapshot = saleDay
    ? getSaleDaySnapshot(saleDay.timeline, saleDay.elapsed)
    : { clock: formatDayClock(0), coins: 0, stock: Object.fromEntries(Object.entries(offers).map(([crop, offer]) => [crop, offer.initialStock])), closed: false };
  const bannerText = saleDay?.timeline.soldOutEarly ? 'Sold out! 🎉 Closing early' : 'Sunset: the market closes';

  return `
    <div class="market-sim-stage ${state.market.simulating ? 'running' : ''}">
      <div class="sale-street"></div>
      <div class="sale-hud">
        <span class="sale-hud-chip">🕗 <strong data-sale-clock>${snapshot.clock}</strong></span>
        <span class="sale-hud-chip">💰 +<strong data-sale-coins>${snapshot.coins.toLocaleString('en-US')}</strong></span>
      </div>
      <div class="sale-stall">
        <div class="sale-stall-awning"></div>
        <div class="sale-stall-counter">
          ${Object.keys(offers).map((crop) => `
            <span class="stall-crop ${snapshot.stock[crop] === 0 ? 'sold-out' : ''}" data-stock-crop="${crop}">${CROP_EMOJIS[crop] ?? '🌱'}<b>${snapshot.stock[crop]}</b></span>
          `).join('')}
        </div>
      </div>
      <div class="sale-crowd"></div>
      <div class="sale-closed-banner" ${snapshot.closed ? '' : 'hidden'}>${bannerText}</div>
    </div>
  `;
}

function renderSaleSimulationScreen() {
  const profile = getMarketLocationProfile();
  const isFinished = !state.market.simulating && state.market.saleComplete;
  const report = state.market.saleReport ?? { sellers: [], totalCustomers: 0, totalRequested: 0, totalSold: 0, totalRevenue: 0 };
  const skipEnabled = state.market.simulating && Date.now() >= (state.market.skipAnimationEnabledAt ?? 0);
  const skipButtonDisabled = state.market.simulating && !skipEnabled;

  return `
    <div class="sale-screen">
      <div class="sale-screen-panel">
        <div class="sale-screen-header">
          <div>
            <p class="eyebrow">${isFinished ? 'Summary' : 'Selling'}</p>
            <h2>${profile.label} Market</h2>
          </div>
        </div>

        ${state.market.simulating ? `
          <div class="market-simulation" aria-label="Market simulation">
            ${renderSaleStage()}
          </div>
        ` : ''}

        <div class="sale-screen-body">
          <p class="market-summary">${state.market.lastSummary}</p>
          ${state.market.simulating ? `
            <div class="sale-day-controls">
              <button type="button" id="sale-screen-speed" class="sell-button speed-button" title="Play the day faster">⏩ ${uiState.saleSpeed}×</button>
              <button type="button" id="sale-screen-skip-animation" class="sell-button skip-animation-button" ${skipButtonDisabled ? 'disabled' : ''}>Skip to results</button>
            </div>
          ` : ''}
          ${isFinished ? `
            <div class="sale-report">
              <div class="sale-report-header">
                <span>Seller</span>
                <span title="Customers who wanted a crop you brought">Wanted</span>
                <span title="Customers who reached your stall while that crop was in stock">Served</span>
                <span>Sold</span>
                <span>Revenue</span>
              </div>
              ${report.sellers.map((seller) => `
                <div class="sale-report-seller">
                  <div class="sale-report-row">
                    <span>${seller.name}</span>
                    <span>${seller.requested}</span>
                    <span>${seller.customers}</span>
                    <span>${seller.sold}</span>
                    <span>+$${seller.revenue}</span>
                  </div>
                  ${Object.entries(seller.assortment ?? {}).length > 0 ? `
                    <div class="sale-report-crops">
                      <strong>${seller.name} stock ledger</strong>
                      <div class="sale-report-crop-header">
                        <span>Crop</span>
                        <span>Stocked</span>
                        <span>Sold</span>
                        <span>Unit price</span>
                        <span>Revenue</span>
                        <span>Left</span>
                      </div>
                      ${Object.entries(seller.assortment).map(([crop, offer]) => {
                        const sale = seller.cropSales?.[crop];
                        const tip = offer.wanted == null ? null : getCropSaleTip(crop, offer);
                        return `
                          <div class="sale-report-crop-row">
                            <span>${CROP_EMOJIS[crop] ?? '🌱'} ${crop}</span>
                            <span>${offer.initialStock}</span>
                            <span>${sale?.quantity ?? 0}</span>
                            <span>${offer.price} coins</span>
                            <span>+${sale?.revenue ?? 0} coins</span>
                            <span>${offer.stock}</span>
                          </div>
                          ${tip ? `<p class="sale-tip tip-${tip.kind}">${SALE_TIP_ICONS[tip.kind]} ${tip.text}</p>` : ''}
                        `;
                      }).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
              <p class="market-summary">${report.totalCustomers} customers visited the ${profile.label} market; ${report.totalRequested} wanted a crop you brought.</p>
              ${report.contracts?.length ? `<p class="market-summary contract-line ready">📜 Contracts delivered: ${report.contracts.map(describeContract).join(' · ')}</p>` : ''}
            </div>
            <button type="button" id="sale-screen-continue" class="sell-button">Continue</button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function render() {
  if (typeof document === 'undefined') {
    return;
  }

  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  if (uiState.screen === 'menu') {
    app.innerHTML = renderMainMenu();
    return;
  }

  if (state.gameOver) {
    app.innerHTML = renderGameOverScreen();
    return;
  }

  if (checkForGameOver()) {
    app.innerHTML = renderGameOverScreen();
    return;
  }

  // Mid-drag renders happen on every pointer move and change nothing worth saving.
  if (!dragState.active) {
    saveGame();
  }

  if (state.shopOpen) {
    const activeShopPanel = document.querySelector('.shop-screen-panel');
    if (activeShopPanel) {
      state.shopScrollTop = activeShopPanel.scrollTop;
    }
  }

  if (state.market.saleScreenOpen) {
    app.innerHTML = renderSaleSimulationScreen();
    return;
  }

  app.innerHTML = `
    <div class="game-shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Farming 101</p>
          <h1>Farm Grid</h1>
        </div>
        <div class="hud">
          <div class="stat"><span>Round</span><strong>${state.round}</strong></div>
          <div class="stat"><span>Season</span><strong>${state.season}</strong></div>
          <div class="stat"><span>Age</span><strong>${state.age}</strong></div>
          <div class="stat" title="Reach ${GOAL_COINS.toLocaleString('en-US')} coins before age ${DEATH_AGE}"><span>Coins / Goal</span><strong>${state.coins.toLocaleString('en-US')} / 1M</strong></div>
          ${renderNextGoal()}
          <button id="menu-button" type="button" class="swap-button menu-button" title="Save and return to the main menu" aria-label="Main menu">☰</button>
        </div>
      </header>

      <main class="game-layout">
        <section class="panel board-panel ${state.marketOpen ? 'market-open' : ''}">
          <div class="section-title-row">
            <h2>Farm Board</h2>
            ${state.harvestFeedback ? `<span class="harvest-feedback">${state.harvestFeedback}</span>` : ''}
          </div>
          ${renderBoard()}

          <div class="hand-section">
            <div class="hand-grid ${state.upgrades.hold ? 'with-hold' : ''}">${renderHandSlots()}</div>
          </div>
        </section>

        <aside class="panel sidebar">
          <h2>Inventory</h2>
          <ul class="inventory-list">
            ${Object.entries(state.inventory).map(([name, amount]) => `
              <li>
                <span class="inventory-item">
                  <span class="inventory-swatch"><span class="inventory-emoji">${CROP_EMOJIS[name] ?? '🌱'}</span></span>
                  <span>${name}</span>
                </span>
                <span class="inventory-level" title="Seed level">Lv ${getCropSeedLevel(name)}</span>
                <span class="inventory-count" title="Seeds">🌱 ${amount}</span>
                <span class="inventory-count" title="Harvested, ready for market">🧺 ${state.cropInventory[name] ?? 0}</span>
              </li>
            `).join('')}
          </ul>

          ${state.contracts.active.length ? `
            <div class="contracts-panel">
              <h3>Contracts</h3>
              ${state.contracts.active.map((contract) => {
                const have = state.cropInventory[contract.crop] ?? 0;
                return `
                  <div class="contract-line ${have >= contract.quantity ? 'ready' : ''}">
                    ${describeContract(contract)}<br>
                    <small>Harvested ${Math.min(have, contract.quantity)}/${contract.quantity} · ${describeVisits(getContractVisitsLeft(contract))} left</small>
                  </div>
                `;
              }).join('')}
            </div>
          ` : ''}

          <button id="market-toggle" type="button" class="market-toggle">
            ${state.marketOpen ? 'Hide Marketplace' : 'Marketplace'}
          </button>
        </aside>
      </main>
    </div>

    ${renderMarketPanel()}
    ${renderShopPanel()}
    ${renderEmergencyButton()}
    ${renderDragGhost()}
  `;

  if (state.shopOpen) {
    requestAnimationFrame(() => {
      const shopPanel = document.querySelector('.shop-screen-panel');
      if (shopPanel) {
        shopPanel.scrollTop = state.shopScrollTop ?? 0;
      }
    });
  }
}

function bindInteractions() {
  const app = document.getElementById('app');
  if (!app) {
    return;
  }

  app.addEventListener('click', (event) => {
    if (event.target.closest('#game-over-retry')) {
      startNewGame();
      return;
    }

    if (event.target.closest('#game-over-menu')) {
      uiState.screen = 'menu';
      render();
      return;
    }

    if (event.target.closest('#menu-continue')) {
      continueGame();
      return;
    }

    if (event.target.closest('#menu-new-game')) {
      // Replacing a saved farm takes a second click.
      if (readStored(SAVE_KEY) && !uiState.confirmNewGame) {
        uiState.confirmNewGame = true;
        render();
        return;
      }
      startNewGame();
      return;
    }

    if (event.target.closest('#menu-button')) {
      openMainMenu();
      return;
    }

  });

  app.addEventListener('click', (event) => {
    const emergencyButton = event.target.closest('#emergency-harvest-button');
    if (emergencyButton) {
      if (!state.marketOpen && !state.shopOpen) {
        emergencyHarvest();
      }
      return;
    }

    if (event.target.closest('#hand-hold-button')) {
      if (!state.marketOpen) {
        holdBlock();
      }
      return;
    }

    const handNextButton = event.target.closest('#hand-next-button');
    if (handNextButton) {
      if (!state.marketOpen) {
        swapHandBlocks();
      }
      return;
    }

    const marketToggle = event.target.closest('#market-toggle');
    if (marketToggle) {
      state.marketOpen = !state.marketOpen;
      render();
      return;
    }

    const marketClose = event.target.closest('#market-close');
    if (marketClose) {
      if (state.market.simulating) {
        return;
      }
      state.marketOpen = false;
      render();
      return;
    }

    const shopToggle = event.target.closest('#shop-toggle');
    if (shopToggle) {
      state.shopOpen = !state.shopOpen;
      render();
      return;
    }

    const shopClose = event.target.closest('#shop-close');
    if (shopClose) {
      state.shopOpen = false;
      state.hand = createHandState(state.inventory);
      render();
      return;
    }

    const shopAction = event.target.closest('[data-shop-action]');
    if (shopAction) {
      const cropKey = shopAction.dataset.shopCrop;
      const action = shopAction.dataset.shopAction;

      if (action === 'select-crop') {
        uiState.shopCrop = cropKey;
        render();
        return;
      }

      if (action === 'unlock-crop' && unlockCrop(cropKey)) {
        uiState.shopCrop = cropKey;
        render();
        return;
      }

      if (action === 'accept-contract') {
        if (!acceptContract(Number(shopAction.dataset.contractId))) {
          setShopFeedback(`You can have at most ${CONTRACT_MAX_ACTIVE} contracts at a time.`, 'error');
        }
        return;
      }

      const purchases = {
        'buy-seed': () => buySeedPack(cropKey),
        'upgrade-crop': () => upgradeCrop(cropKey),
        'restock-emergency': restockEmergencyHarvest,
        'unlock-market': () => unlockMarket(shopAction.dataset.shopMarket),
        'buy-hold': buyHoldSlot,
        'upgrade-barn': buyBarnUpgrade,
      };
      // Unaffordable tiles stay clickable (just dimmed), so say why nothing happened.
      if (action === 'unlock-crop' || (purchases[action] && !purchases[action]())) {
        setShopFeedback('Not enough coins for that yet.', 'error');
      }
      return;
    }

    const saleScreenSkip = event.target.closest('#sale-screen-skip-animation');
    if (saleScreenSkip) {
      if (Date.now() < (state.market.skipAnimationEnabledAt ?? 0)) {
        return;
      }

      const profile = getMarketLocationProfile();
      const simulation = state.market.activeSimulation;
      const selectedCrops = state.market.activeSelectedCrops || [];

      if (simulation && selectedCrops.length > 0) {
        state.market.skipAnimation = true;
        finalizeMarketSimulation(profile, simulation);
      }
      return;
    }

    const saleScreenSpeed = event.target.closest('#sale-screen-speed');
    if (saleScreenSpeed) {
      // Updated in place: a full render would only restart the walkers' elements.
      cycleSaleSpeed();
      saleScreenSpeed.textContent = `⏩ ${uiState.saleSpeed}×`;
      return;
    }

    const saleScreenContinue = event.target.closest('#sale-screen-continue');
    if (saleScreenContinue) {
      startNextSeason();
      render();
      return;
    }

    const skipSeasonButton = event.target.closest('#market-skip-season');
    if (skipSeasonButton) {
      skipSeason();
      return;
    }
  });

  app.addEventListener('pointerdown', (event) => {
    if (state.marketOpen) {
      return;
    }

    const card = event.target.closest('.tetromino-card');
    if (!card) {
      return;
    }

    const slotIndex = Number(card.dataset.slotIndex);
    startDrag(slotIndex, event);
  });

  app.addEventListener('change', (event) => {
    if (event.target.id === 'market-location') {
      if (state.market.simulating) {
        return;
      }
      setMarketLocation(event.target.value);
      return;
    }
  });

  app.addEventListener('click', (event) => {
    if (state.market.simulating) {
      return;
    }

    const cropButton = event.target.closest('[data-market-crop]');
    if (cropButton && event.target.closest('.market-crop-select')) {
      state.market.crop = cropButton.dataset.marketCrop;
      render();
      return;
    }

    const actionButton = event.target.closest('[data-market-action]');
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.marketAction;
    const cropKey = actionButton.dataset.marketCrop || state.market.crop;

    if (action === 'keep-dec' || action === 'keep-inc') {
      adjustKeep(cropKey, action === 'keep-inc' ? BARN_KEEP_STEP : -BARN_KEEP_STEP);
      return;
    }

    if (action === 'price-dec') {
      state.market.crop = cropKey;
      adjustMarketPrice(-1, cropKey);
    }

    if (action === 'price-inc') {
      state.market.crop = cropKey;
      adjustMarketPrice(1, cropKey);
    }
  });

  app.addEventListener('click', (event) => {
    if (event.target.id === 'market-start-selling') {
      startSelling();
    }
  });

  document.addEventListener('pointermove', (event) => {
    if (state.marketOpen) {
      return;
    }
    updateDragPreview(event);
  });
  document.addEventListener('pointerup', (event) => {
    if (state.marketOpen) {
      return;
    }
    finishDrag(event);
  });
  document.addEventListener('pointercancel', (event) => {
    if (state.marketOpen) {
      return;
    }
    finishDrag(event);
  });

  let lastWheelTimestamp = 0;

  document.addEventListener('wheel', (event) => {
    if (state.marketOpen || event.ctrlKey || event.metaKey) {
      return;
    }

    const hoveredCard = event.target.closest?.('.tetromino-card');
    const overGame = dragState.active || hoveredCard || event.target.closest?.('.board-grid');
    if (!overGame) {
      return;
    }

    // Rotation is throttled, but every wheel event over the game is consumed: a trackpad sends many
    // events per gesture, and the throttled ones used to scroll the page.
    event.preventDefault();

    const slotIndex = dragState.active
      ? dragState.slotIndex
      : hoveredCard ? Number(hoveredCard.dataset.slotIndex) : null;
    if (!Number.isInteger(slotIndex)) {
      return;
    }

    const now = Date.now();
    const delta = Math.abs(event.deltaY || event.deltaX || 0);
    if (delta === 0 || now - lastWheelTimestamp < 150) {
      return;
    }

    lastWheelTimestamp = now;
    rotateSelectedTetromino(slotIndex);
  }, { passive: false });
}

export {
  acceptContract,
  adjustKeep,
  adjustMarketPrice,
  advanceHand,
  advanceTime,
  autoHarvest,
  buildMarketCustomerSimulation,
  buyBarnUpgrade,
  buyHoldSlot,
  buySeedPack,
  checkForGameOver,
  continueGame,
  cycleSaleSpeed,
  createHandState,
  createInitialGameState,
  createMarketState,
  createSale,
  emergencyHarvest,
  finalizeMarketSimulation,
  generateContractOffers,
  getBarnCapacity,
  getBuyChance,
  getCalendar,
  getCropSaleTip,
  getDemandForecast,
  getEmergencyRestockCost,
  getHarvestYield,
  getMarketLocationProfile,
  getNextGoal,
  getUpgradeCost,
  getVarietyCount,
  holdBlock,
  openMainMenu,
  render,
  restockEmergencyHarvest,
  setKeep,
  skipSeason,
  startNewGame,
  startNextSeason,
  startSelling,
  state,
  swapHandBlocks,
  uiState,
  unlockCrop,
  unlockMarket,
  upgradeCrop,
};

if (typeof document !== 'undefined' && document.getElementById('app')) {
  uiState.screen = 'menu';
  render();
  bindInteractions();
}
