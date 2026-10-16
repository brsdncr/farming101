import {
  CROP_BASE_PRICES,
  CROP_COLORS,
  CROP_EMOJIS,
  CROP_KEYS,
  CROP_SEED_CONFIG,
  AUTO_HARVEST_MIN_GROUP_SIZE,
  EMERGENCY_HARVEST_COST,
  EMERGENCY_HARVEST_MAX_CHARGES,
  MARKET_DEMAND_WEIGHTS,
  MARKET_LOCATIONS,
  MARKET_RIVAL_STAGES,
  SEED_UPGRADE_COST_BY_LEVEL,
} from './src/config/crops.js';
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

  return Number(SEED_UPGRADE_COST_BY_LEVEL[currentLevel + 1] ?? (currentLevel + 1) * 10);
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
    entryFee: profile.entryFee,
    trafficMin: profile.trafficMin,
    trafficMax: profile.trafficMax,
    competitors: profile.competitors,
    prices: { ...CROP_BASE_PRICES },
    selectedQuantity: 0,
    selectedQuantities: {},
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

function getMarketLocationProfile() {
  return MARKET_LOCATIONS[state.market.location] ?? MARKET_LOCATIONS.village;
}

function clampMarketQuantity(cropKey = state.market.crop || 'tomato') {
  const maxAvailable = state.cropInventory[cropKey] || 0;
  const current = Number(state.market.selectedQuantities[cropKey] ?? 0);
  const next = maxAvailable > 0 ? Math.min(Math.max(0, Number.isFinite(current) ? current : 0), maxAvailable) : 0;

  state.market.selectedQuantity = next;
  state.market.selectedQuantities[cropKey] = next;
}

function setMarketLocation(locationKey) {
  if (!MARKET_LOCATIONS[locationKey]) {
    return;
  }

  state.market.location = locationKey;
  const profile = MARKET_LOCATIONS[locationKey];
  state.market.entryFee = profile.entryFee;
  state.market.trafficMin = profile.trafficMin;
  state.market.trafficMax = profile.trafficMax;
  state.market.competitors = profile.competitors;
  state.market.lastSummary = `${profile.label} market selected.`;
  render();
}

function setMarketQuantity(value, cropKey = state.market.crop || 'tomato', shouldRender = true) {
  const maxAvailable = state.cropInventory[cropKey] || 0;
  const nextValue = Math.max(0, Math.min(Math.floor(Number(value) || 0), maxAvailable));

  state.market.selectedQuantities[cropKey] = nextValue;
  state.market.selectedQuantity = nextValue;
  state.market.crop = cropKey;

  if (shouldRender) {
    render();
  }
}

function adjustMarketQuantity(delta, cropKey = state.market.crop || 'tomato') {
  const currentValue = Number(state.market.selectedQuantities[cropKey] ?? 0);
  setMarketQuantity(currentValue + delta, cropKey);
}

function adjustMarketPrice(delta, cropKey = state.market.crop || 'tomato') {
  const currentPrice = state.market.prices[cropKey] ?? 5;
  const nextPrice = Math.max(1, currentPrice + delta);
  state.market.prices[cropKey] = nextPrice;
  state.market.crop = cropKey;
  render();
}

function getMaxReasonablePrice(crop) {
  const basePrice = CROP_BASE_PRICES[crop] ?? 10;
  return basePrice * 1.75;
}

function runMarketSimulation() {
  const crop = state.market.crop || 'tomato';
  const profile = getMarketLocationProfile();
  const available = state.cropInventory[crop] || 0;
  if (available <= 0) {
    state.market.lastSummary = `No harvested ${crop} available to sell.`;
    render();
    return;
  }

  if (state.coins < profile.entryFee) {
    state.market.lastSummary = `You need at least ${profile.entryFee} coins to sell in ${profile.label}.`;
    render();
    return;
  }

  const quantity = Math.min(Number(state.market.selectedQuantity) || 1, available);
  const playerPrice = Number(state.market.prices[crop] ?? 5);
  const basePrice = CROP_BASE_PRICES[crop] ?? 10;
  const maxReasonablePrice = getMaxReasonablePrice(crop);

  if (playerPrice > maxReasonablePrice) {
    state.market.lastSummary = `${crop} is priced too high at ${playerPrice}. Buyers won't purchase it at that rate.`;
    render();
    return;
  }

  const aiPrices = Array.from({ length: profile.competitors }, () => {
    const variance = (Math.random() * 0.4) - 0.2;
    const competitorPrice = basePrice * (1 + variance);
    return Math.max(1, competitorPrice);
  });
  const averageAiPrice = aiPrices.reduce((sum, value) => sum + value, 0) / aiPrices.length;
  const traffic = Math.floor(Math.random() * (profile.trafficMax - profile.trafficMin + 1)) + profile.trafficMin;
  const priceAdvantage = playerPrice <= averageAiPrice ? 1 : Math.max(0.25, averageAiPrice / playerPrice);
  const demandRatio = Math.min(1, traffic / profile.trafficMax);
  const sellChance = Math.min(1, (0.35 + demandRatio * 0.65) * priceAdvantage);
  const soldCount = Math.max(0, Math.min(quantity, Math.round(quantity * sellChance)));
  const unsoldCount = quantity - soldCount;
  const revenue = soldCount * playerPrice;

  state.coins -= profile.entryFee;
  state.coins += revenue;
  state.cropInventory[crop] = Math.max(0, (state.cropInventory[crop] ?? 0) - quantity);
  state.market.selectedQuantity = Math.min(Math.max(1, quantity), Math.max(1, state.cropInventory[crop] || 1));
  state.market.lastSummary = `Sold ${soldCount}/${quantity} ${crop} at ${playerPrice} coins each in ${profile.label}. AI avg: ${averageAiPrice.toFixed(1)}. Entry fee: ${profile.entryFee}. ${unsoldCount} spoiled and decayed.`;
  state.market.lastSummary += ` Revenue: ${revenue} coins.`;
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

const RIVAL_ARCHETYPES = [
  { name: 'General', assortmentOffset: 1, stockFactor: 0.9, priceMin: 0.9, priceMax: 1.1 },
  { name: 'Specialist', assortmentOffset: -1, stockFactor: 1.2, priceMin: 0.95, priceMax: 1.15 },
  { name: 'Discount', assortmentOffset: 0, stockFactor: 1, priceMin: 0.8, priceMax: 1 },
];

function buildMarketCustomerSimulation(profile, selectedCrops, options = {}) {
  const random = options.random ?? Math.random;
  const stage = MARKET_RIVAL_STAGES[state.market.location] ?? MARKET_RIVAL_STAGES.village;
  const demandWeights = MARKET_DEMAND_WEIGHTS[state.market.location] ?? MARKET_DEMAND_WEIGHTS.village;
  const baseDemand = Object.values(demandWeights).reduce((sum, weight) => sum + weight, 0);
  const traffic = randomMarketCount(profile.trafficMin, profile.trafficMax, random);
  const sellers = [{
    name: 'You',
    archetype: 'Player',
    customers: 0,
    requested: 0,
    sold: 0,
    revenue: 0,
    crops: {},
    cropSales: {},
    assortment: {},
  }];

  const unlockedProductCount = CROP_KEYS.filter((crop) => getCropSeedLevel(crop) > 0).length;
  const averageTraffic = (profile.trafficMin + profile.trafficMax) / 2;
  const rivalCount = Math.max(0, Math.floor(profile.competitors));
  for (let rivalIndex = 0; rivalIndex < rivalCount; rivalIndex += 1) {
    const archetype = RIVAL_ARCHETYPES[rivalIndex % RIVAL_ARCHETYPES.length];
    const eligibleCrops = stage.productPool;
    const maximumAssortment = Math.min(stage.maxProducts, eligibleCrops.length);
    const minimumSize = archetype.name === 'Specialist'
      ? 1
      : Math.max(1, Math.min(maximumAssortment, unlockedProductCount + archetype.assortmentOffset - 1));
    const maximumSize = archetype.name === 'Specialist'
      ? 1
      : Math.max(minimumSize, Math.min(maximumAssortment, unlockedProductCount + archetype.assortmentOffset + 1));
    const assortmentSize = randomMarketCount(minimumSize, maximumSize, random);
    const unselectedCrops = [...eligibleCrops];
    const assortment = {};

    for (let productIndex = 0; productIndex < assortmentSize && unselectedCrops.length > 0; productIndex += 1) {
      const cropIndex = Math.floor(random() * unselectedCrops.length);
      const crop = unselectedCrops.splice(cropIndex, 1)[0];
      const referencePrice = CROP_BASE_PRICES[crop] ?? 10;
      const priceMultiplier = archetype.priceMin + random() * (archetype.priceMax - archetype.priceMin);
      const price = Math.max(1, Math.round(referencePrice * priceMultiplier));
      const cropDemand = Number(demandWeights[crop] ?? 0) / baseDemand;
      const expectedDemand = averageTraffic * cropDemand * archetype.stockFactor;
      const stockVariation = 0.75 + random() * 0.5;
      const stock = Math.max(1, Math.round(expectedDemand * stockVariation));

      assortment[crop] = {
        price,
        stock: Math.min(stock, stage.stockCapacity),
        initialStock: Math.min(stock, stage.stockCapacity),
      };
    }

    let remainingCapacity = stage.stockCapacity;
    for (const offer of Object.values(assortment)) {
      offer.stock = Math.min(offer.stock, remainingCapacity);
      offer.initialStock = offer.stock;
      remainingCapacity -= offer.stock;
    }

    sellers.push({
      name: `Rival ${rivalIndex + 1}`,
      archetype: archetype.name,
      customers: 0,
      requested: 0,
      sold: 0,
      revenue: 0,
      crops: {},
      cropSales: {},
      assortment,
    });
  }

  for (const crop of selectedCrops) {
    const offeredStock = Math.min(
      Math.max(0, Number(state.market.selectedQuantities[crop] ?? 0)),
      Math.max(0, Number(state.cropInventory[crop] ?? 0)),
    );
    if (offeredStock > 0) {
      sellers[0].assortment[crop] = {
        price: Math.max(1, Number(state.market.prices[crop] ?? CROP_BASE_PRICES[crop] ?? 5)),
        stock: offeredStock,
        initialStock: offeredStock,
      };
    }
  }

  const customerNeeds = Array.from({ length: traffic }, () => weightedRandomEntry(demandWeights, random));
  const events = [];

  for (let customerIndex = 0; customerIndex < customerNeeds.length; customerIndex += 1) {
    const crop = customerNeeds[customerIndex];
    const referencePrice = CROP_BASE_PRICES[crop] ?? 10;
    const budget = referencePrice * (1.2 + random() * 0.6);
    const optionsForPurchase = [];

    for (const seller of sellers) {
      const offer = seller.assortment[crop];
      if (!offer) {
        continue;
      }

      seller.requested += 1;
      if (offer.stock <= 0 || offer.price > budget
        || (seller === sellers[0] && offer.price > getMaxReasonablePrice(crop))) {
        continue;
      }

      seller.customers += 1;
      optionsForPurchase.push({
        seller,
        offer,
        weight: Math.exp(-2 * (offer.price / referencePrice - 0.8)),
      });
    }

    const noPurchaseWeight = 0.55;
    const totalWeight = noPurchaseWeight + optionsForPurchase.reduce((sum, option) => sum + option.weight, 0);
    let choice = random() * totalWeight;
    let purchasedOption = null;

    for (const option of optionsForPurchase) {
      choice -= option.weight;
      if (choice < 0) {
        purchasedOption = option;
        break;
      }
    }

    let sold = 0;
    let revenue = 0;
    let sellerName = null;
    let sellerKey = null;
    let table = 'market';
    let price = 0;

    if (purchasedOption) {
      const { seller, offer } = purchasedOption;
      offer.stock -= 1;
      seller.sold += 1;
      seller.revenue += offer.price;
      seller.crops[crop] = (seller.crops[crop] ?? 0) + 1;
      const cropSale = seller.cropSales[crop] ?? { quantity: 0, price: offer.price, revenue: 0 };
      cropSale.quantity += 1;
      cropSale.revenue += offer.price;
      seller.cropSales[crop] = cropSale;
      sold = 1;
      revenue = offer.price;
      sellerName = seller.name;
      sellerKey = seller === sellers[0] ? 'you' : `rival-${sellers.indexOf(seller)}`;
      table = seller === sellers[0] ? 'you' : sellerKey;
      price = offer.price;
    }

    events.push({
      id: `customer-${customerIndex + 1}`,
      sellerName,
      sellerKey,
      table,
      side: customerIndex % 2 === 0 ? 'left' : 'right',
      crop,
      wantedCrop: crop,
      emoji: CROP_EMOJIS[crop] ?? '🌱',
      customerIndex: customerIndex + 1,
      requested: 1,
      offered: optionsForPurchase.length > 0,
      sold,
      revenue,
      price,
    });
  }

  const totalRequested = sellers.reduce((sum, seller) => sum + seller.requested, 0);
  const totalSold = sellers.reduce((sum, seller) => sum + seller.sold, 0);
  const totalRevenue = sellers.reduce((sum, seller) => sum + seller.revenue, 0);

  return {
    sellers,
    events,
    customerNeeds,
    totalCustomers: traffic,
    totalRequested,
    totalSold,
    totalRevenue,
  };
}

function buildSaleReport(profile, selectedCrops) {
  const sellers = [{
    name: 'You',
    customers: 0,
    requested: 0,
    sold: 0,
    revenue: 0,
    crops: {},
  }];

  for (let index = 0; index < profile.competitors; index += 1) {
    sellers.push({
      name: `Rival ${index + 1}`,
      customers: 0,
      requested: 0,
      sold: 0,
      revenue: 0,
      crops: {},
    });
  }

  const events = [];
  const playerRemainingStock = {};

  for (const crop of selectedCrops) {
    playerRemainingStock[crop] = Math.min(Number(state.market.selectedQuantities[crop] ?? 0), state.cropInventory[crop] ?? 0);
  }

  const processSellerCustomers = (seller, sellerIndex, customerCount, isPlayer) => {
    for (let customerIndex = 0; customerIndex < customerCount; customerIndex += 1) {
      let crop;
      let sold = 0;
      let revenue = 0;
      let price = 0;

      if (isPlayer) {
        crop = selectedCrops[Math.floor(Math.random() * selectedCrops.length)] ?? 'tomato';
        const basePrice = CROP_BASE_PRICES[crop] ?? 10;
        const playerPrice = Number(state.market.prices[crop] ?? basePrice ?? 5);
        const maxReasonablePrice = getMaxReasonablePrice(crop);
        const competitorSet = Array.from({ length: profile.competitors }, () => {
          const variance = (Math.random() * 0.4) - 0.2;
          return Math.max(1, basePrice * (1 + variance));
        });
        const averageAiPrice = competitorSet.reduce((sum, value) => sum + value, 0) / competitorSet.length;
        const priceAdvantage = playerPrice <= averageAiPrice ? 1 : Math.max(0.25, averageAiPrice / playerPrice);
        const demandRatio = Math.min(1, customerCount / Math.max(profile.trafficMax, 1));
        const sellChance = Math.min(1, (0.35 + demandRatio * 0.65) * priceAdvantage);
        const canSell = (playerRemainingStock[crop] ?? 0) > 0 && playerPrice <= maxReasonablePrice;
        sold = canSell && Math.random() < sellChance ? 1 : 0;
        price = playerPrice;
        revenue = sold * playerPrice;

        if (sold > 0) {
          playerRemainingStock[crop] = Math.max(0, (playerRemainingStock[crop] ?? 0) - 1);
        }
      } else {
        crop = CROP_KEYS[Math.floor(Math.random() * CROP_KEYS.length)];
        const basePrice = CROP_BASE_PRICES[crop] ?? 10;
        const sellChance = 0.55 + Math.random() * 0.35;
        sold = Math.random() < sellChance ? 1 : 0;
        price = basePrice;
        revenue = sold * basePrice;
      }

      seller.customers += 1;
      seller.requested += 1;
      seller.sold += sold;
      seller.revenue += revenue;
      seller.crops[crop] = (seller.crops[crop] ?? 0) + sold;

      events.push({
        id: `${seller.name.toLowerCase()}-${seller.customers}`,
        sellerName: seller.name,
        sellerKey: isPlayer ? 'you' : `rival-${sellerIndex}`,
        table: isPlayer ? 'you' : `rival-${sellerIndex}`,
        side: customerIndex % 2 === 0 ? 'left' : 'right',
        crop,
        emoji: CROP_EMOJIS[crop] ?? '🌱',
        customerIndex: seller.customers,
        requested: 1,
        sold,
        revenue,
        price,
      });
    }
  };

  const playerCustomerCount = randomMarketCount(profile.trafficMin, profile.trafficMax);
  processSellerCustomers(sellers[0], 0, playerCustomerCount, true);

  for (let sellerIndex = 1; sellerIndex < sellers.length; sellerIndex += 1) {
    const seller = sellers[sellerIndex];
    const customerCount = randomMarketCount(profile.trafficMin, profile.trafficMax);
    processSellerCustomers(seller, sellerIndex, customerCount, false);
  }

  const totalCustomers = sellers.reduce((sum, seller) => sum + seller.customers, 0);
  const totalRequested = sellers.reduce((sum, seller) => sum + seller.requested, 0);
  const totalSold = sellers.reduce((sum, seller) => sum + seller.sold, 0);
  const totalRevenue = sellers.reduce((sum, seller) => sum + seller.revenue, 0);

  return { sellers, events, totalCustomers, totalRequested, totalSold, totalRevenue };
}

// function buildSaleReport(profile, selectedCrops) {
//   const simulation = buildMarketCustomerSimulation(profile, selectedCrops);
//   return {
//     sellers: simulation.sellers,
//     totalCustomers: simulation.totalCustomers,
//     totalRequested: simulation.totalRequested,
//     totalSold: simulation.totalSold,
//     totalRevenue: simulation.totalRevenue,
//   };
// }

function finalizeMarketSimulation(profile, simulation, selectedCrops) {
  if (!state.market.simulating || state.market.activeSimulation !== simulation) {
    return;
  }

  const playerSeller = simulation.sellers[0];
  const totalRevenue = playerSeller.revenue;
  const summaries = selectedCrops.map((crop) => {
    const offeredQuantity = Math.min(Number(state.market.selectedQuantities[crop] ?? 0), state.cropInventory[crop] ?? 0);
    const soldCount = playerSeller.crops[crop] ?? 0;
    const price = Number(state.market.prices[crop] ?? CROP_BASE_PRICES[crop] ?? 5);
    const unselectedQuantity = Math.max(0, (state.cropInventory[crop] ?? 0) - offeredQuantity);

    if (soldCount > 0) {
      return `${crop}: +${soldCount * price} (${soldCount}/${offeredQuantity}) +${unselectedQuantity} seed`;
    }

    return `${crop}: ${offeredQuantity} discarded +${unselectedQuantity} seed`;
  });

  for (const crop of selectedCrops) {
    const cropStock = state.cropInventory[crop] ?? 0;
    const offeredQuantity = Math.min(Number(state.market.selectedQuantities[crop] ?? 0), cropStock);
    const unselectedQuantity = Math.max(0, cropStock - offeredQuantity);

    state.inventory[crop] = (state.inventory[crop] ?? 0) + unselectedQuantity;
    state.cropInventory[crop] = 0;
    state.market.selectedQuantities[crop] = 0;
  }

  state.coins -= profile.entryFee;
  state.coins += totalRevenue;
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
  state.market.lastSummary = `Selling in ${profile.label}: ${summaries.join(' • ')}. Entry fee: ${profile.entryFee}. Total revenue: ${totalRevenue} coins.`;
  render();
}

function startSelling() {
  const profile = getMarketLocationProfile();

  if (state.coins < profile.entryFee) {
    state.market.lastSummary = `You need at least ${profile.entryFee} coins to sell in ${profile.label}.`;
    render();
    return;
  }

  const selectedCrops = CROP_KEYS.filter((crop) => (Number(state.market.selectedQuantities[crop] ?? 0) > 0) && (state.cropInventory[crop] ?? 0) > 0);

  if (selectedCrops.length === 0) {
    state.market.lastSummary = `Select a crop quantity to start selling.`;
    render();
    return;
  }

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
      finalizeMarketSimulation(profile, simulation, selectedCrops);
      return;
    }

    const nextIndex = state.market.currentCustomerIndex + 1;
    const event = state.market.simulationEvents[nextIndex];

    if (!event) {
      finalizeMarketSimulation(profile, simulation, selectedCrops);
      return;
    }

    state.market.currentCustomerIndex = nextIndex;
    state.market.lastSummary = event.sold
      ? `${event.sellerName} sold ${event.crop} for +$${event.revenue}.`
      : event.offered
        ? `A customer passed on ${event.crop}.`
        : `A customer wanted ${event.crop}, but no store could fulfill the demand.`;

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
    season: 'summer',
    coins: 20,
    grid: createGrid(6, 6),
    inventory,
    cropInventory,
    seedLevels,
    hand,
    market: createMarketState(),
    marketOpen: false,
    shopOpen: false,
    shopFeedback: null,
    shopScrollTop: 0,
    highlightedGroup: [],
    activeSlotIndex: null,
    dragPreview: null,
    gameOver: false,
    gameOverReason: '',
    emergencyHarvests: EMERGENCY_HARVEST_MAX_CHARGES,
    harvestFeedback: '',
  };
}

function checkForGameOver() {
  if (state.gameOver) {
    return true;
  }

  const canHarvest = state.coins >= 5;

  if (!canHarvest) {
    state.gameOver = true;
    state.gameOverReason = 'You ran out of coins and can no longer afford to harvest.';
    state.marketOpen = false;
    state.shopOpen = false;
    state.market.saleScreenOpen = false;
    state.market.simulating = false;
    return true;
  }

  return false;
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
function harvestGroups(groups, { withLevelBonus }) {
  const harvested = {};

  for (const group of groups) {
    // Seed level bonus is a flat extra yield per harvested group, not per tile.
    const bonus = withLevelBonus ? getCropHarvestYieldBonus(group.cropType) : 0;
    harvested[group.cropType] = (harvested[group.cropType] ?? 0) + group.cells.length + bonus;
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
  const profile = getMarketLocationProfile();
  const selectedTotal = CROP_KEYS.reduce((total, cropKey) => total + Number(state.market.selectedQuantities[cropKey] ?? 0), 0);
  const hasAnySelected = selectedTotal > 0;
  const hasEnoughCoins = state.coins >= (profile.entryFee ?? 0);
  return hasAnySelected && hasEnoughCoins;
}

function renderMarketPanel() {
  const crop = state.market.crop || 'tomato';
  const profile = getMarketLocationProfile();
  const marketTableCount = profile.label === 'Village' ? 2 : profile.label === 'Town' ? 3 : 4;
  const availableCrops = CROP_KEYS.filter((item) => ((state.inventory[item] ?? 0) > 0 || (state.cropInventory[item] ?? 0) > 0));
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
                <option value="${key}" ${state.market.location === key ? 'selected' : ''}>${location.label}</option>
              `).join('')}
            </select>
          </label>

          <div class="market-inventory-list">
            ${availableCrops.length
              ? availableCrops.map((item) => {
                  const quantity = Number(state.market.selectedQuantities[item] ?? 0);
                  const price = Number(state.market.prices[item] ?? 5);
                  const isActive = crop === item;

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
                          <span class="market-crop-count">Seeds: ${state.inventory[item] ?? 0}</span>
                          <span class="market-crop-count">Harvest: ${state.cropInventory[item] ?? 0}</span>
                        </div>
                      </div>

                      <div class="market-crop-controls">
                        <div class="selector-row small-inline quantity-slider-row">
                          <span class="quantity-slider-label">Qty</span>
                          <input
                            type="range"
                            min="0"
                            max="${Math.max(0, state.cropInventory[item] ?? 0)}"
                            step="1"
                            value="${quantity}"
                            class="market-qty-slider"
                            data-market-crop="${item}"
                            data-market-action="qty-set"
                            ${state.market.simulating ? 'disabled' : ''}
                          >
                          <strong data-market-quantity="${item}">${quantity}</strong>
                        </div>

                        <div class="selector-row small-inline">
                          <button type="button" class="small-button" data-market-crop="${item}" data-market-action="price-dec" ${state.market.simulating ? 'disabled' : ''}>-</button>
                          <span>Price: <strong>${price}</strong></span>
                          <button type="button" class="small-button" data-market-crop="${item}" data-market-action="price-inc" ${state.market.simulating ? 'disabled' : ''}>+</button>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('')
              : '<p class="empty-sale">No seeds or harvested crops available.</p>'}
          </div>

          <div class="market-meta">
            <span>Entry fee: ${profile.entryFee}</span>
            <span>Traffic: ${profile.trafficMin}-${profile.trafficMax}</span>
            <span>AI rivals: ${profile.competitors}</span>
          </div>

          <button type="button" id="market-start-selling" class="sell-button" ${sellDisabled ? 'disabled' : ''}>Start Selling</button>
          <p class="market-summary">${state.market.lastSummary}</p>
        </div>
      </div>
    </div>
  `;
}

function renderGameOverScreen() {
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
          <div class="game-over-badge">💸</div>
          <h3 class="game-over-title">Game Over</h3>
          <p class="game-over-message">${state.gameOverReason || 'You can no longer afford to harvest or enter the market.'}</p>
          <button id="game-over-retry" type="button" class="sell-button game-over-button">Retry</button>
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
  const rivalPositions = [
    { left: 70, top: 68 },
    { left: 80, top: 56 },
    { left: 88, top: 72 },
  ];
  const rivalTables = Array.from({ length: Math.max(1, profile.competitors ?? 1) }, (_, index) => {
    const position = rivalPositions[index] ?? { left: Math.min(92, 68 + index * 8), top: 58 + (index % 2) * 18 };
    return `
      <div class="market-table rival-table" style="left:${position.left}%; top:${position.top}%">
        <span class="table-label">Rival${Math.max(1, index + 1) === 1 ? '' : ` ${index + 1}`}</span>
      </div>
    `;
  }).join('');

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
            ${rivalTables}
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
                <span>Customers</span>
                <span>Requested</span>
                <span>Sold</span>
                <span>Revenue</span>
              </div>
              ${report.sellers.map((seller) => `
                <div class="sale-report-seller">
                  <div class="sale-report-row">
                    <span>${seller.name}</span>
                    <span>${seller.customers}</span>
                    <span>${seller.requested}</span>
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
              <div class="sale-report-total">
                <span>Total</span>
                <span>${report.totalCustomers}</span>
                <span>${report.totalRequested}</span>
                <span>${report.totalSold}</span>
                <span>+$${report.totalRevenue}</span>
              </div>
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
          <div class="stat"><span>Coins</span><strong>${state.coins}</strong></div>
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
        finalizeMarketSimulation(profile, simulation, selectedCrops);
      }
      return;
    }

    const saleScreenContinue = event.target.closest('#sale-screen-continue');
    if (saleScreenContinue) {
      clearBoardForReturn();
      state.market.saleScreenOpen = false;
      state.market.saleComplete = false;
      state.market.simulating = false;
      state.market.activeSimulation = null;
      state.market.activeSelectedCrops = [];
      state.market.skipAnimationEnabledAt = 0;
      state.shopOpen = true;
      render();
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

  app.addEventListener('input', (event) => {
    if (state.market.simulating) {
      return;
    }

    const quantitySlider = event.target.closest('[data-market-action="qty-set"]');
    if (!quantitySlider) {
      return;
    }

    const cropKey = quantitySlider.dataset.marketCrop || state.market.crop;
    setMarketQuantity(quantitySlider.value, cropKey, false);
    const quantityValue = quantitySlider.closest('.quantity-slider-row')
      ?.querySelector('[data-market-quantity]');
    if (quantityValue) {
      quantityValue.textContent = String(state.market.selectedQuantities[cropKey]);
    }
  });

  app.addEventListener('click', (event) => {
    if (state.market.simulating) {
      return;
    }

    const cropButton = event.target.closest('[data-market-crop]');
    if (cropButton && event.target.closest('.market-crop-select')) {
      state.market.crop = cropButton.dataset.marketCrop;
      clampMarketQuantity(state.market.crop);
      render();
      return;
    }

    const actionButton = event.target.closest('[data-market-action]');
    if (!actionButton) {
      return;
    }

    const action = actionButton.dataset.marketAction;
    const cropKey = actionButton.dataset.marketCrop || state.market.crop;

    if (action === 'qty-dec') {
      state.market.crop = cropKey;
      adjustMarketQuantity(-1, cropKey);
    }

    if (action === 'qty-inc') {
      state.market.crop = cropKey;
      adjustMarketQuantity(1, cropKey);
    }

    if (action === 'qty-set') {
      state.market.crop = cropKey;
      setMarketQuantity(actionButton.value, cropKey);
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
  buildMarketCustomerSimulation,
  checkForGameOver,
  advanceHand,
  createHandState,
  createInitialGameState,
  createMarketState,
  finalizeMarketSimulation,
  autoHarvest,
  emergencyHarvest,
  getMarketLocationProfile,
  render,
  restockEmergencyHarvest,
  setMarketQuantity,
  startSelling,
  state,
  swapHandBlocks,
};

if (typeof document !== 'undefined' && document.getElementById('app')) {
  render();
  bindInteractions();
}
