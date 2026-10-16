import {
  AUTO_HARVEST_MIN_GROUP_SIZE,
  CROP_BASE_PRICES,
  CROP_COLORS,
  CROP_EMOJIS,
  CROP_KEYS,
  CROP_SEED_CONFIG,
  EMERGENCY_HARVEST_COST,
  EMERGENCY_HARVEST_MAX_CHARGES,
  MARKET_BASE_BUY_RATE,
  MARKET_DEMAND_WEIGHTS,
  MARKET_LOCATIONS,
  MARKET_PRICE_SENSITIVITY,
  MIN_UNITS_FOR_VARIETY,
  SEED_UPGRADE_COST_FACTOR,
  SEED_UPGRADE_COST_GROWTH,
} from './src/config/crops.js';
import {
  DEATH_AGE,
  GOAL_COINS,
  SEASONS,
  START_AGE,
  VISITS_PER_SEASON,
  VISITS_PER_YEAR,
} from './src/config/game.js';
import { SHAPE_DEFINITIONS, SHAPE_TYPES } from './src/config/shapes.js';
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

// The hand holds the block being played plus a preview of the next one.
const CURRENT_SLOT = 0;
const NEXT_SLOT = 1;
const HAND_SIZE = 2;

const state = createInitialGameState();
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

function getCropHarvestYieldBonus(cropKey) {
  const currentLevel = getCropSeedLevel(cropKey);
  return Math.max(0, currentLevel - 1);
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
    pendingSale: [],
    lastSummary: 'No sales run yet.',
    simulating: false,
    saleScreenOpen: false,
    saleComplete: false,
    simulationEvents: [],
    currentCustomerIndex: -1,
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

// A crop type counts toward the variety minimum only with enough units,
// so a single token crop can't open a market for a one-crop harvest.
function getVarietyCount(locationKey, cropInventory = state.cropInventory) {
  return getMarketProductPool(locationKey)
    .filter((crop) => (cropInventory[crop] ?? 0) >= MIN_UNITS_FOR_VARIETY)
    .length;
}

// Share of customers who buy at this price: MARKET_BASE_BUY_RATE at the base price,
// approaching 100% as the price drops and 0% as it rises.
function getBuyChance(price, basePrice) {
  const priceRatio = price / basePrice;
  const baseOdds = (1 - MARKET_BASE_BUY_RATE) / MARKET_BASE_BUY_RATE;
  return 1 / (1 + baseOdds * Math.exp(MARKET_PRICE_SENSITIVITY * (priceRatio - 1)));
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

function adjustMarketPrice(delta, cropKey = state.market.crop || 'tomato') {
  const currentPrice = state.market.prices[cropKey] ?? 5;
  const nextPrice = Math.max(1, currentPrice + delta);
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
    // Customers arriving after a crop sold out walk past and aren't animated.
    if (offer.stock <= 0) {
      return;
    }

    seller.customers += 1;
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
    }

    events.push({
      id: `customer-${customerIndex + 1}`,
      sellerName: bought ? seller.name : null,
      sellerKey: bought ? 'you' : null,
      table: bought ? 'you' : 'market',
      side: events.length % 2 === 0 ? 'left' : 'right',
      crop,
      wantedCrop: crop,
      emoji: CROP_EMOJIS[crop] ?? '🌱',
      customerIndex: customerIndex + 1,
      requested: 1,
      offered: true,
      sold: bought ? 1 : 0,
      revenue: bought ? offer.price : 0,
      price: offer.price,
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

  state.cropInventory = createCropInventoryState();
  state.coins += totalRevenue;
  advanceTime();
  state.market.simulating = false;
  state.market.saleComplete = true;
  state.market.saleReport = {
    sellers: simulation.sellers,
    totalCustomers: simulation.totalCustomers,
    totalRequested: simulation.totalRequested,
    totalSold: simulation.totalSold,
    totalRevenue: simulation.totalRevenue,
  };
  state.market.skipAnimation = false;
  state.market.skipAnimationEnabledAt = 0;
  state.market.activeSimulation = null;
  state.market.activeSelectedCrops = [];
  state.market.lastSummary = `Selling in ${profile.label}: ${summaries.join(' • ')}. Total revenue: ${totalRevenue} coins.`;
  render();
}

function getSellingBlocker() {
  const profile = getMarketLocationProfile();
  const locationKey = state.market.location;

  if (!isMarketUnlocked(locationKey)) {
    return `${profile.label} is locked. Unlock it in the shop.`;
  }

  const variety = getVarietyCount(locationKey);
  if (variety < profile.minVariety) {
    return `${profile.label} needs ${profile.minVariety} crop types with ${MIN_UNITS_FOR_VARIETY}+ harvested units each. You have ${variety}.`;
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
  state.shopOpen = true;
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

function startSelling() {
  const profile = getMarketLocationProfile();
  const blocker = getSellingBlocker();

  if (blocker) {
    state.market.lastSummary = blocker;
    render();
    return;
  }

  const selectedCrops = getMarketProductPool(state.market.location)
    .filter((crop) => (state.cropInventory[crop] ?? 0) > 0);
  const simulation = buildMarketCustomerSimulation(profile, selectedCrops);

  state.marketOpen = false;
  state.market.saleScreenOpen = true;
  state.market.simulating = true;
  state.market.saleComplete = false;
  state.market.saleReport = null;
  state.market.simulationEvents = simulation.events;
  state.market.currentCustomerIndex = -1;
  state.market.activeSimulation = simulation;
  state.market.activeSelectedCrops = [...selectedCrops];
  state.market.skipAnimation = false;
  state.market.skipAnimationEnabledAt = Date.now() + 3000;
  state.market.lastSummary = `Selling in ${profile.label}...`;
  render();

  setTimeout(() => {
    if (state.market.simulating && !state.market.skipAnimation) {
      render();
    }
  }, 3000);

  const advanceCustomerSimulation = () => {
    // Stop the loop once this sale has been finalized (e.g. via Skip Animation).
    if (!state.market.simulating || state.market.activeSimulation !== simulation) {
      return;
    }

    if (state.market.skipAnimation) {
      finalizeMarketSimulation(profile, simulation);
      return;
    }

    const nextIndex = state.market.currentCustomerIndex + 1;
    const event = state.market.simulationEvents[nextIndex];

    if (!event) {
      finalizeMarketSimulation(profile, simulation);
      return;
    }

    state.market.currentCustomerIndex = nextIndex;
    state.market.lastSummary = event.sold
      ? `${event.sellerName} sold ${event.crop} for +$${event.revenue}.`
      : `A customer passed on ${event.crop} at ${event.price} coins.`;

    render();

    const delay = event.sold ? 1500 : 1100;
    setTimeout(advanceCustomerSimulation, delay);
  };

  setTimeout(advanceCustomerSimulation, 900);
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
    harvestFeedback: '',
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
  return true;
}

function resetGameState() {
  Object.assign(state, createInitialGameState());
  if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
    window.location.reload();
  }
}

function clearBoardForReturn() {
  state.grid = createGrid(GRID_SIZE, GRID_SIZE);
  state.highlightedGroup = [];
  state.dragPreview = null;
  state.activeSlotIndex = null;
  state.hand = createHandState(state.inventory);
  state.harvestFeedback = '';
  state.market.simulationEvents = [];
  state.market.currentCustomerIndex = -1;
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
  const available = getUnreservedInventory(state.inventory, state.hand.slots, NEXT_SLOT);
  const { tetromino, bag } = nextTetrominoInBag(available);
  state.hand.slots[NEXT_SLOT] = tetromino;
  state.hand.bag = bag;
}

function swapHandBlocks() {
  if (dragState.active) {
    return;
  }

  const { slots } = state.hand;
  [slots[CURRENT_SLOT], slots[NEXT_SLOT]] = [slots[NEXT_SLOT], slots[CURRENT_SLOT]];
  render();
}

// Harvesting is free: crops move from the field into the harvested stock for market,
// and their cells are cleared. Returns the harvested quantities per crop.
// Units harvested from one connected group of `tileCount` tiles.
// Seed level bonus is a flat extra yield per harvested group, not per tile.
function getHarvestYield(cropKey, tileCount, { withLevelBonus = true } = {}) {
  return tileCount + (withLevelBonus ? getCropHarvestYieldBonus(cropKey) : 0);
}

function harvestGroups(groups, { withLevelBonus }) {
  const harvested = {};

  for (const group of groups) {
    const quantity = getHarvestYield(group.cropType, group.cells.length, { withLevelBonus });
    harvested[group.cropType] = (harvested[group.cropType] ?? 0) + quantity;
    state.grid = clearConnectedCells(state.grid, group.cells);
  }

  for (const [cropType, quantity] of Object.entries(harvested)) {
    state.cropInventory[cropType] = (state.cropInventory[cropType] ?? 0) + quantity;
  }

  return harvested;
}

function describeHarvest(prefix, harvested) {
  const crops = Object.entries(harvested)
    .map(([cropType, quantity]) => `${CROP_EMOJIS[cropType] ?? '🌱'} ${quantity}`)
    .join(' · ');
  return `${prefix}: ${crops}`;
}

// Runs after every placement: any group that has grown large enough is harvested.
function autoHarvest() {
  const groups = findAllConnectedGroups(state.grid)
    .filter((group) => group.cells.length >= AUTO_HARVEST_MIN_GROUP_SIZE);

  if (groups.length === 0) {
    return;
  }

  state.harvestFeedback = describeHarvest('Auto-harvested', harvestGroups(groups, { withLevelBonus: true }));
}

function isFieldEmpty() {
  return state.grid.every((row) => row.every((cell) => !cell));
}

// One-shot joker for a field clogged with small groups: harvests everything, without level bonus.
function emergencyHarvest() {
  if (state.emergencyHarvests <= 0 || isFieldEmpty()) {
    return;
  }

  const groups = findAllConnectedGroups(state.grid);
  state.emergencyHarvests -= 1;
  state.harvestFeedback = describeHarvest('Emergency harvest', harvestGroups(groups, { withLevelBonus: false }));
  render();
}

function restockEmergencyHarvest() {
  if (state.emergencyHarvests >= EMERGENCY_HARVEST_MAX_CHARGES || state.coins < EMERGENCY_HARVEST_COST) {
    return false;
  }

  state.coins -= EMERGENCY_HARVEST_COST;
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
  const size = rect.width / GRID_SIZE;
  const x = Math.floor((event.clientX - rect.left) / size);
  const y = Math.floor((event.clientY - rect.top) / size);

  if (!isInsideGrid(y, x, GRID_SIZE, GRID_SIZE)) {
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
  const nextRowCell = boardCells[GRID_SIZE]?.getBoundingClientRect();

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
  const columnStep = metrics?.columnStep ?? rect.width / GRID_SIZE;
  const rowStep = metrics?.rowStep ?? rect.height / GRID_SIZE;
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

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const crop = state.grid[row][col];
      const previewCell = state.dragPreview && state.dragPreview.tetromino.cells.find((cell) => row === state.dragPreview.row + cell.row && col === state.dragPreview.col + cell.col);
      const isPreview = !!previewCell;
      const soilColor = '#3c2d22';
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
      const artMarkup = artCrop ? renderCropPixelArt(artCrop, isPreview ? 0.8 : 1) : '';

      cells.push(`
        <button
          class="${cellClass}"
          data-row="${row}"
          data-col="${col}"
          style="background:${soilColor}; opacity:${isPreview ? 0.8 : 1}; border-color:${isInvalidPreview ? '#ff8c7a' : 'var(--tile-border)'};"
          title="${crop || previewCell?.cropType || 'Empty'}"
          type="button"
        >
          ${artMarkup}
        </button>
      `);
    }
  }

  return `<div class="board-grid">${cells.join('')}${renderBoardDragPreview()}</div>`;
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

function renderHandSlots() {
  const cards = state.hand.slots
    .map((tetromino, index) => {
      const safeTetromino = tetromino && tetromino.cells ? tetromino : { shapeType: 'O', cells: [] };
      const shapeWidth = Math.max(0, ...safeTetromino.cells.map((cell) => cell.col + 1));
      const shapeHeight = Math.max(0, ...safeTetromino.cells.map((cell) => cell.row + 1));
      // The mini grid has 8x8 half-size tracks and each block spans 2, so any shape can be centered exactly.
      const colOffset = 4 - shapeWidth;
      const rowOffset = 4 - shapeHeight;
      const cells = safeTetromino.cells.map((cell) => `
        <div
          class="slot-cell filled"
          style="grid-row:${rowOffset + cell.row * 2 + 1} / span 2; grid-column:${colOffset + cell.col * 2 + 1} / span 2; background:#3c2d22; border-color:rgba(255,255,255,0.08);"
        >
          ${cell.cropType ? renderCropPixelArt(cell.cropType, 1) : ''}
        </div>
      `);

      return `
        <div class="tetromino-card ${index === NEXT_SLOT ? 'next-card' : ''} ${state.activeSlotIndex === index ? 'selected' : ''}" data-slot-index="${index}">
          <div class="shape-name">${index === CURRENT_SLOT ? 'Current' : 'Next'}</div>
          <div class="mini-grid">${cells.join('')}</div>
        </div>
      `;
    });

  return `
    ${cards[CURRENT_SLOT]}
    <button id="hand-next-button" type="button" class="swap-button" title="Swap the current block with the next one" aria-label="Swap">🔁</button>
    ${cards[NEXT_SLOT]}
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

function renderShopPanel() {
  if (!state.shopOpen) {
    return '';
  }

  return `
    <div class="market-modal-backdrop open">
      <div class="market-modal-panel shop-panel" role="dialog" aria-modal="true">
        <div class="market-header">
          <h2>Seed Shop</h2>
          <button type="button" id="shop-close" class="close-button">×</button>
        </div>

        ${state.shopFeedback ? `
          <div class="shop-feedback ${state.shopFeedback.kind}">
            ${state.shopFeedback.message}
          </div>
        ` : ''}

        <div class="shop-list" data-shop-list>
          <div class="shop-row">
            <div class="shop-row-header">
              <div class="sale-row-label">
                <span aria-hidden="true">🚨</span>
                <span>Emergency harvest</span>
              </div>
              <span class="shop-level-tag">${state.emergencyHarvests}/${EMERGENCY_HARVEST_MAX_CHARGES}</span>
            </div>

            <div class="shop-actions">
              <button
                type="button"
                class="shop-button"
                data-shop-action="restock-emergency"
                ${state.emergencyHarvests >= EMERGENCY_HARVEST_MAX_CHARGES || state.coins < EMERGENCY_HARVEST_COST ? 'disabled' : ''}
              >
                ${state.emergencyHarvests >= EMERGENCY_HARVEST_MAX_CHARGES ? 'Ready' : `Restock (${EMERGENCY_HARVEST_COST})`}
              </button>
            </div>
          </div>

          ${Object.entries(MARKET_LOCATIONS).filter(([, location]) => location.unlockCost > 0).map(([locationKey, location]) => `
            <div class="shop-row">
              <div class="shop-row-header">
                <div class="sale-row-label">
                  <span aria-hidden="true">🏪</span>
                  <span>${location.label} market</span>
                </div>
                <span class="shop-level-tag">${isMarketUnlocked(locationKey) ? 'Open' : 'Locked'}</span>
              </div>

              <div class="shop-actions">
                ${isMarketUnlocked(locationKey) ? '<span class="shop-maxed">Unlocked</span>' : `
                  <button
                    type="button"
                    class="shop-button secondary"
                    data-shop-action="unlock-market"
                    data-shop-market="${locationKey}"
                    ${state.coins < location.unlockCost ? 'disabled' : ''}
                  >
                    Unlock (${location.unlockCost})
                  </button>
                `}
              </div>
            </div>
          `).join('')}

          ${CROP_KEYS.map((cropKey) => {
            const config = getCropSeedConfig(cropKey);
            const currentLevel = getCropSeedLevel(cropKey);
            const unlocked = currentLevel > 0;
            const nextUpgradeCost = getUpgradeCost(cropKey);
            const seedPackCost = getCropSeedPrice(cropKey);
            const seedPackSize = getCropSeedPackSize(cropKey);
            const canAffordSeed = state.coins >= seedPackCost;
            const canAffordUnlock = state.coins >= (config.unlockCost ?? 0);
            const canAffordUpgrade = nextUpgradeCost !== null && state.coins >= nextUpgradeCost;

            return `
              <div class="shop-row">
                <div class="shop-row-header">
                  <div class="sale-row-label">
                    <span class="sale-swatch" style="background:${CROP_COLORS[cropKey]};"></span>
                    <span>${config.label}</span>
                  </div>
                  <span class="shop-level-tag">Lv ${currentLevel || 0}</span>
                </div>

                <div class="shop-actions">
                  <button
                    type="button"
                    class="shop-button"
                    data-shop-action="buy-seed"
                    data-shop-crop="${cropKey}"
                    ${!unlocked || !canAffordSeed ? 'disabled' : ''}
                  >
                    Buy ${seedPackSize}x (${seedPackCost})
                  </button>

                  ${unlocked ? (nextUpgradeCost !== null ? `
                    <button
                      type="button"
                      class="shop-button secondary"
                      data-shop-action="upgrade-crop"
                      data-shop-crop="${cropKey}"
                      ${!canAffordUpgrade ? 'disabled' : ''}
                    >
                      Upgrade (${nextUpgradeCost}) · +${getCropHarvestYieldBonus(cropKey) + 1} yield
                    </button>
                  ` : '<span class="shop-maxed">Max level</span>') : `
                    <button
                      type="button"
                      class="shop-button secondary"
                      data-shop-action="unlock-crop"
                      data-shop-crop="${cropKey}"
                      ${!canAffordUnlock ? 'disabled' : ''}
                    >
                      Unlock (${config.unlockCost ?? 0})
                    </button>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="shop-footer">
          <span>Coins: ${state.coins}</span>
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
                  const buyerShare = Math.round(getBuyChance(price, CROP_BASE_PRICES[item]) * 100);

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
                        ${soldHere ? `
                          <div class="selector-row small-inline">
                            <button type="button" class="small-button" data-market-crop="${item}" data-market-action="price-dec" ${state.market.simulating ? 'disabled' : ''}>-</button>
                            <span>Price: <strong>${price}</strong> · ~${buyerShare}% of buyers</span>
                            <button type="button" class="small-button" data-market-crop="${item}" data-market-action="price-inc" ${state.market.simulating ? 'disabled' : ''}>+</button>
                          </div>
                        ` : `
                          <p class="empty-sale">${profile.label} customers don't buy ${item}. It will spoil.</p>
                        `}
                      </div>
                    </div>
                  `;
                }).join('')
              : '<p class="empty-sale">No harvested crops yet. Grow groups of 5+ or use Emergency.</p>'}
          </div>

          <div class="market-meta">
            <span>Variety: ${variety}/${profile.minVariety} crop types with ${MIN_UNITS_FOR_VARIETY}+ units</span>
            <span>Traffic: ${profile.trafficMin}-${profile.trafficMax}</span>
            <span>All harvested crops are sold here; leftovers spoil.</span>
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
        </div>
      </div>
    </div>
  `;
}

function renderSaleSimulationScreen() {
  const profile = getMarketLocationProfile();
  const isFinished = !state.market.simulating && state.market.saleComplete;
  const report = state.market.saleReport ?? { sellers: [], totalCustomers: 0, totalRequested: 0, totalSold: 0, totalRevenue: 0 };
  const activeEvent = state.market.simulationEvents[state.market.currentCustomerIndex] ?? null;
  const visibleEvents = activeEvent ? [activeEvent] : [];
  const skipEnabled = state.market.simulating && Date.now() >= (state.market.skipAnimationEnabledAt ?? 0);
  const skipButtonDisabled = state.market.simulating && !skipEnabled;
  const cinematicStart = activeEvent ? `${activeEvent.side === 'left' ? '-18%' : '118%'}` : '-18%';
  const cinematicEnd = activeEvent ? (activeEvent.table === 'you' ? 30 : 70) : 30;

  return `
    <div class="sale-screen">
      <div class="sale-screen-panel">
        <div class="sale-screen-header">
          <div>
            <p class="eyebrow">${isFinished ? 'Summary' : 'Selling'}</p>
            <h2>${profile.label} Market</h2>
          </div>
        </div>

        <div class="market-simulation" aria-label="Market simulation">
          <div class="market-sim-stage ${state.market.simulating ? 'running' : ''}">
            <div class="market-table our-table" style="left:30%; top:62%">
              <span class="table-label">You</span>
            </div>
            ${visibleEvents.map((event, index) => {
              const isPlayerCustomer = event.table === 'you';
              const startX = event.side === 'left' ? cinematicStart : (event.side === 'right' ? '118%' : '-18%');
              const endX = event.table === 'market' ? 50 : (isPlayerCustomer ? 30 : 70);
              const startY = isPlayerCustomer ? 18 + (index % 3) * 8 : 18 + (index % 3) * 15;
              const endY = isPlayerCustomer ? 65 : 60;
              const customerClass = isPlayerCustomer ? 'customer from-left' : 'customer from-right';
              return `
                <div
                  class="${customerClass}"
                  style="--start-x:${startX}; --end-x:${endX}%; --start-y:${startY}%; --end-y:${endY}%; top:${startY}%; animation-delay:0s;"
                >
                  ${event.sold ? `<span class="purchase-emoji">${event.emoji}</span>` : ''}
                </div>
              `;
            }).join('')}
            ${visibleEvents.filter((event) => event.sold).map((event) => {
              const left = event.table === 'you' ? 30 : (event.table === 'market' ? 50 : 70);
              return `<div class="float-gain sale-gain" style="left:${left}%; top:20%;">💰 +$${event.revenue}</div>`;
            }).join('')}
          </div>
        </div>

        <div class="sale-screen-body">
          <p class="market-summary">${state.market.lastSummary}</p>
          ${state.market.simulating ? `
            <button type="button" id="sale-screen-skip-animation" class="sell-button skip-animation-button" ${skipButtonDisabled ? 'disabled' : ''}>Skip Animation</button>
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
                        return `
                          <div class="sale-report-crop-row">
                            <span>${CROP_EMOJIS[crop] ?? '🌱'} ${crop}</span>
                            <span>${offer.initialStock}</span>
                            <span>${sale?.quantity ?? 0}</span>
                            <span>${offer.price} coins</span>
                            <span>+${sale?.revenue ?? 0} coins</span>
                            <span>${offer.stock}</span>
                          </div>
                        `;
                      }).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
              <p class="market-summary">${report.totalCustomers} customers visited the ${profile.label} market; ${report.totalRequested} wanted a crop you brought.</p>
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

  if (state.gameOver) {
    app.innerHTML = renderGameOverScreen();
    return;
  }

  if (checkForGameOver()) {
    app.innerHTML = renderGameOverScreen();
    return;
  }

  if (state.shopOpen) {
    const activeShopPanel = document.querySelector('.shop-panel');
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
            <h2>Hand</h2>
            <div class="hand-grid">${renderHandSlots()}</div>
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
                <div class="inventory-amounts">
                  <strong class="inventory-level">Level: ${getCropSeedLevel(name)}</strong>
                  <strong>Seeds: ${amount}</strong>
                  <strong>Harvest: ${state.cropInventory[name] ?? 0}</strong>
                </div>
              </li>
            `).join('')}
          </ul>

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
      const shopPanel = document.querySelector('.shop-panel');
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
    const retryButton = event.target.closest('#game-over-retry');
    if (retryButton) {
      resetGameState();
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

      if (action === 'buy-seed') {
        buySeedPack(cropKey);
        return;
      }

      if (action === 'unlock-crop') {
        unlockCrop(cropKey);
        return;
      }

      if (action === 'upgrade-crop') {
        upgradeCrop(cropKey);
      }

      if (action === 'restock-emergency') {
        restockEmergencyHarvest();
      }

      if (action === 'unlock-market') {
        unlockMarket(shopAction.dataset.shopMarket);
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
    const slotIndex = dragState.active
      ? dragState.slotIndex
      : hoveredCard ? Number(hoveredCard.dataset.slotIndex) : null;
    if (slotIndex === null || slotIndex === undefined || !Number.isInteger(slotIndex)) {
      return;
    }

    const now = Date.now();
    const delta = Math.abs(event.deltaY || event.deltaX || 0);
    if (delta === 0 || now - lastWheelTimestamp < 150) {
      return;
    }

    lastWheelTimestamp = now;
    event.preventDefault();
    rotateSelectedTetromino(slotIndex);
  }, { passive: false });
}

export {
  advanceHand,
  advanceTime,
  autoHarvest,
  buildMarketCustomerSimulation,
  buySeedPack,
  checkForGameOver,
  createHandState,
  createInitialGameState,
  createMarketState,
  emergencyHarvest,
  finalizeMarketSimulation,
  getBuyChance,
  getCalendar,
  getHarvestYield,
  getMarketLocationProfile,
  getUpgradeCost,
  getVarietyCount,
  render,
  restockEmergencyHarvest,
  skipSeason,
  startNextSeason,
  startSelling,
  state,
  swapHandBlocks,
  unlockCrop,
  unlockMarket,
  upgradeCrop,
};

if (typeof document !== 'undefined' && document.getElementById('app')) {
  render();
  bindInteractions();
}
