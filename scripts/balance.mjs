// Headless balance simulation: a bot plays whole careers with the real game code
// (hand, placement, auto-harvest, emergency, market, shop, calendar) and reports
// how quickly it reaches the coin goal.
//
// Usage: npm run balance -- [tilesPerVisit=100] [runs=10]
// tilesPerVisit is the player's effort: how many crop tiles they plant per market visit.
import { app } from '../tests/helpers/appEnvironment.js';
import {
  AUTO_HARVEST_MIN_GROUP_SIZE,
  BARN_LEVELS,
  CROP_BASE_PRICES,
  CROP_KEYS,
  CROP_SEED_CONFIG,
  MARKET_DEMAND_WEIGHTS,
  MARKET_LOCATIONS,
} from '../src/config/crops.js';
import { DEATH_AGE, GOAL_COINS, START_AGE, VISITS_PER_YEAR } from '../src/config/game.js';
import { canPlaceShape } from '../src/state/gridState.js';

const TILES_PER_VISIT = Number(process.argv[2] ?? 100);
const RUNS = Number(process.argv[3] ?? 10);
// Set BALANCE_NO_BARN=1 to measure careers that never use the barn.
globalThis.USE_BARN = process.env.BALANCE_NO_BARN !== '1';
const MAX_VISITS = (DEATH_AGE - START_AGE) * VISITS_PER_YEAR;
// Group size the bot assumes when estimating units harvested per tile.
const TYPICAL_GROUP_SIZE = 6;
const { state } = app;

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Placement ----------

function normalize(cells) {
  const minRow = Math.min(...cells.map((cell) => cell.row));
  const minCol = Math.min(...cells.map((cell) => cell.col));
  return cells.map((cell) => ({ ...cell, row: cell.row - minRow, col: cell.col - minCol }));
}

// Same rotation as the game's rotateCells.
function rotate(cells) {
  const maxCol = Math.max(...cells.map((cell) => cell.col));
  return normalize(cells.map((cell) => ({ ...cell, row: maxCol - cell.col, col: cell.row })));
}

function rotations(cells) {
  const result = [];
  const seen = new Set();
  let current = normalize(cells);
  for (let turn = 0; turn < 4; turn += 1) {
    const key = current.map((cell) => `${cell.row},${cell.col},${cell.cropType}`).sort().join('|');
    if (!seen.has(key)) {
      seen.add(key);
      result.push(current);
    }
    current = rotate(current);
  }
  return result;
}

// Rewards completing groups that auto-harvest (by their real yield), and otherwise growing same-crop groups.
function scoreMove(grid, cells, originRow, originCol) {
  const fieldSize = grid.length;
  const placed = grid.map((row) => row.slice());
  for (const cell of cells) {
    placed[originRow + cell.row][originCol + cell.col] = cell.cropType ?? null;
  }

  const seen = new Set();
  let score = 0;
  for (const cell of cells) {
    if (!cell.cropType) {
      continue;
    }

    const startKey = (originRow + cell.row) * fieldSize + originCol + cell.col;
    if (seen.has(startKey)) {
      continue;
    }

    let size = 0;
    const queue = [startKey];
    seen.add(startKey);
    while (queue.length > 0) {
      const key = queue.pop();
      size += 1;
      const row = Math.floor(key / fieldSize);
      const col = key % fieldSize;
      for (const [nextRow, nextCol] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
        const nextKey = nextRow * fieldSize + nextCol;
        if (nextRow >= 0 && nextRow < fieldSize && nextCol >= 0 && nextCol < fieldSize
          && !seen.has(nextKey) && placed[nextRow][nextCol] === cell.cropType) {
          seen.add(nextKey);
          queue.push(nextKey);
        }
      }
    }

    // Completed groups are worth what they actually yield (bigger groups pay more per tile).
    score += size >= AUTO_HARVEST_MIN_GROUP_SIZE ? app.getHarvestYield(cell.cropType, size) * 10 : size * size * 0.5;
  }

  return score;
}

function bestMove(grid, tetromino) {
  if (!tetromino?.cells?.length) {
    return null;
  }

  let best = null;
  for (const cells of rotations(tetromino.cells)) {
    for (let row = 0; row < grid.length; row += 1) {
      for (let col = 0; col < grid.length; col += 1) {
        if (!canPlaceShape(grid, { cells }, row, col)) {
          continue;
        }
        const score = scoreMove(grid, cells, row, col);
        if (!best || score > best.score) {
          best = { cells, row, col, score };
        }
      }
    }
  }
  return best;
}

function placeMove(move) {
  for (const cell of move.cells) {
    if (cell.cropType) {
      state.inventory[cell.cropType] -= 1;
    }
    state.grid[move.row + cell.row][move.col + cell.col] = cell.cropType ?? null;
  }
  state.grid = state.grid.map((row) => row.slice());
  app.autoHarvest();
  app.advanceHand();
}

function fieldCropValue() {
  return state.grid.flat().reduce((sum, crop) => sum + (crop ? CROP_BASE_PRICES[crop] : 0), 0);
}

function plantVisit(stats) {
  for (let placements = 0; placements < TILES_PER_VISIT / 4;) {
    const [current, next] = state.hand.slots;
    let move = bestMove(state.grid, current);
    const nextMove = bestMove(state.grid, next);
    if (nextMove && (!move || nextMove.score > move.score)) {
      [state.hand.slots[0], state.hand.slots[1]] = [next, current];
      move = nextMove;
    }

    if (!move) {
      // Field clogged with seeds still in hand: use the joker if there is something to save.
      if (state.emergencyHarvests > 0 && fieldCropValue() > app.getEmergencyRestockCost() && (current?.cells?.length || next?.cells?.length)) {
        app.emergencyHarvest();
        stats.emergencies += 1;
        continue;
      }
      break;
    }

    stats.tilesPlanted += move.cells.filter((cell) => cell.cropType).length;
    placeMove(move);
    placements += 1;
  }

  // Salvage the leftover field when no market would accept the harvest, or when it is worth
  // more than restocking the emergency harvest.
  if (state.emergencyHarvests > 0 && fieldCropValue() > 0
    && (sellableMarkets().length === 0 || fieldCropValue() > app.getEmergencyRestockCost() * 1.5)) {
    app.emergencyHarvest();
    stats.emergencies += 1;
  }
}

// ---------- Market ----------

function expectedWanters(locationKey, crop) {
  const weights = MARKET_DEMAND_WEIGHTS[locationKey];
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const profile = MARKET_LOCATIONS[locationKey];
  return ((profile.trafficMin + profile.trafficMax) / 2) * ((weights[crop] ?? 0) / totalWeight);
}

// Price that maximizes expected revenue given stock and demand.
function bestPrice(locationKey, crop, stock) {
  const basePrice = CROP_BASE_PRICES[crop];
  const wanters = expectedWanters(locationKey, crop);
  let best = { price: basePrice, revenue: 0 };
  for (let price = Math.max(1, Math.round(basePrice * 0.5)); price <= basePrice * 3; price += 1) {
    const revenue = price * Math.min(stock, wanters * app.getBuyChance(price, basePrice));
    if (revenue > best.revenue) {
      best = { price, revenue };
    }
  }
  return best;
}

function sellableMarkets() {
  return Object.keys(MARKET_LOCATIONS).filter((locationKey) => (
    state.unlockedMarkets[locationKey]
    && app.getVarietyCount(locationKey) >= MARKET_LOCATIONS[locationKey].minVariety
  ));
}

function visitMarket(stats) {
  const options = sellableMarkets();
  if (options.length === 0) {
    stats.skipped += 1;
    app.skipSeason();
    return;
  }

  const plans = options.map((locationKey) => {
    const crops = Object.keys(MARKET_DEMAND_WEIGHTS[locationKey]).filter((crop) => state.cropInventory[crop] > 0);
    const prices = Object.fromEntries(crops.map((crop) => [crop, bestPrice(locationKey, crop, state.cropInventory[crop])]));
    const contractRewards = state.contracts.active
      .filter((contract) => contract.locationKey === locationKey && state.cropInventory[contract.crop] >= contract.quantity)
      .reduce((sum, contract) => sum + contract.reward, 0);
    const expected = Object.values(prices).reduce((sum, plan) => sum + plan.revenue, 0) + contractRewards;
    return { locationKey, crops, prices, expected };
  });
  const plan = plans.sort((a, b) => b.expected - a.expected)[0];

  for (const [crop, { price }] of Object.entries(plan.prices)) {
    state.market.prices[crop] = price;
  }
  state.market.location = plan.locationKey;

  // Barn: keep what would spoil anyway (stock beyond expected sales, and crops this market doesn't
  // buy) for the next visit, while there is room.
  if (globalThis.USE_BARN) {
    const spare = CROP_KEYS
      .map((crop) => {
        const stock = state.cropInventory[crop] ?? 0;
        const contractNeed = state.contracts.active
          .filter((contract) => contract.crop === crop && contract.locationKey === plan.locationKey)
          .reduce((sum, contract) => sum + contract.quantity, 0);
        const expectedSales = plan.crops.includes(crop)
          ? expectedWanters(plan.locationKey, crop) * app.getBuyChance(plan.prices[crop].price, CROP_BASE_PRICES[crop])
          : 0;
        return { crop, units: Math.floor(stock - contractNeed - expectedSales), value: CROP_BASE_PRICES[crop] };
      })
      .filter((entry) => entry.units > 0)
      .sort((a, b) => b.value - a.value);
    for (const { crop, units } of spare) {
      app.setKeep(crop, units);
      // Kept crops don't count toward variety: never keep so much that the market won't open.
      if (app.getVarietyCount(plan.locationKey) < MARKET_LOCATIONS[plan.locationKey].minVariety) {
        app.setKeep(crop, 0);
      }
    }
    stats.unitsKept += Object.values(state.market.keep).reduce((sum, units) => sum + units, 0);
  }
  const profile = MARKET_LOCATIONS[plan.locationKey];
  stats.unitsHarvested += Object.values(state.cropInventory).reduce((sum, value) => sum + value, 0);
  const simulation = app.createSale(profile);
  stats.contractsDelivered += simulation.contracts.length;
  stats.unitsSold += simulation.totalSold;
  state.market.simulating = true;
  state.market.saleScreenOpen = true;
  state.market.activeSimulation = simulation;
  app.finalizeMarketSimulation(profile, simulation);
  app.startNextSeason();
  state.shopOpen = false;
}

// ---------- Shop ----------

function packCost(crop) {
  return CROP_SEED_CONFIG[crop].seedPackCost;
}

function seedCostPerTile(crop) {
  return packCost(crop) / CROP_SEED_CONFIG[crop].seedPackQty;
}

function isUnlocked(crop) {
  return (state.seedLevels[crop] ?? 0) > 0;
}

// The market the bot plans to sell in next: the busiest unlocked one whose variety it can meet.
function targetMarket() {
  const options = Object.keys(MARKET_LOCATIONS).filter((locationKey) => {
    const unlockedInPool = Object.keys(MARKET_DEMAND_WEIGHTS[locationKey]).filter(isUnlocked).length;
    return state.unlockedMarkets[locationKey] && unlockedInPool >= MARKET_LOCATIONS[locationKey].minVariety;
  });
  return options.sort((a, b) => MARKET_LOCATIONS[b].trafficMax - MARKET_LOCATIONS[a].trafficMax)[0] ?? 'village';
}

function unitsPerTile(crop) {
  return app.getHarvestYield(crop, TYPICAL_GROUP_SIZE) / TYPICAL_GROUP_SIZE;
}

// Tiles needed to supply every customer who wants this crop at the base price.
function demandTiles(locationKey, crop) {
  return Math.ceil((expectedWanters(locationKey, crop) * app.getBuyChance(1, 1)) / unitsPerTile(crop));
}

function planSeeds(locationKey) {
  const crops = Object.keys(MARKET_DEMAND_WEIGHTS[locationKey])
    .filter(isUnlocked)
    .sort((a, b) => CROP_BASE_PRICES[b] - CROP_BASE_PRICES[a]);
  const minVariety = MARKET_LOCATIONS[locationKey].minVariety;
  const tilesByCrop = {};
  let tilesLeft = TILES_PER_VISIT;

  // Cover the variety minimum first with the most valuable crops. Each needs a fair share of the
  // field to form auto-harvest groups; then fill by value up to demand.
  const varietyShare = Math.floor(TILES_PER_VISIT / (minVariety + 1));
  crops.slice(0, minVariety).forEach((crop) => {
    // Enough to form groups, but no more than this market will buy (plus spare for harvest losses).
    const share = Math.min(varietyShare, Math.max(12, Math.ceil(demandTiles(locationKey, crop) * 1.3)));
    tilesByCrop[crop] = share;
    tilesLeft -= share;
  });
  // Contracts for this market need their quantity on top of what customers buy.
  for (const contract of state.contracts.active.filter((active) => active.locationKey === locationKey)) {
    const tiles = Math.ceil((contract.quantity / unitsPerTile(contract.crop)) * 1.3);
    tilesByCrop[contract.crop] = (tilesByCrop[contract.crop] ?? 0) + tiles;
    tilesLeft -= tiles;
  }
  for (const crop of crops) {
    const extra = Math.max(0, Math.min(tilesLeft, demandTiles(locationKey, crop) - (tilesByCrop[crop] ?? 0)));
    tilesByCrop[crop] = (tilesByCrop[crop] ?? 0) + extra;
    tilesLeft -= extra;
  }
  return tilesByCrop;
}

function visitCost(tilesByCrop) {
  return Object.entries(tilesByCrop).reduce((sum, [crop, tiles]) => sum + tiles * seedCostPerTile(crop), 0);
}

function shop(stats) {
  // Keep enough coins for two visits' seeds in the most expensive market plan, so an unlock
  // never leaves the next visit short of the crops its variety minimum needs.
  const reserve = () => 2 * Math.max(...Object.keys(MARKET_LOCATIONS).map((locationKey) => visitCost(planSeeds(locationKey))));

  // Unlock markets and crops (cheapest first) whenever a seed reserve is left afterwards.
  for (let bought = true; bought;) {
    bought = false;
    const candidates = [
      ...Object.keys(MARKET_LOCATIONS)
        .filter((locationKey) => !state.unlockedMarkets[locationKey])
        .map((locationKey) => ({ cost: MARKET_LOCATIONS[locationKey].unlockCost, buy: () => app.unlockMarket(locationKey), market: locationKey })),
      ...(globalThis.USE_BARN ? BARN_LEVELS.slice(app.state.upgrades.barnLevel + 1, app.state.upgrades.barnLevel + 2)
        .map((level) => ({ cost: level.cost, buy: () => app.buyBarnUpgrade() })) : []),
      ...CROP_KEYS
        .filter((crop) => !isUnlocked(crop))
        .filter((crop) => Object.keys(MARKET_LOCATIONS).some((locationKey) => state.unlockedMarkets[locationKey] && crop in MARKET_DEMAND_WEIGHTS[locationKey]))
        .map((crop) => ({ cost: CROP_SEED_CONFIG[crop].unlockCost, buy: () => app.unlockCrop(crop) })),
    ].sort((a, b) => a.cost - b.cost);

    const next = candidates[0];
    if (next && state.coins >= next.cost + reserve()) {
      next.buy();
      if (next.market) {
        stats.marketUnlockVisit[next.market] = stats.visits;
      }
      bought = true;
    }
  }

  // Only take contracts for crops it already grows for that market: a new crop type would mix into
  // every block and clog the field for many seasons.
  const grownCrops = new Set(Object.keys(planSeeds(targetMarket())).filter((crop) => planSeeds(targetMarket())[crop] > 0));
  for (const offer of [...state.contracts.offers]) {
    if (offer.locationKey === targetMarket() && grownCrops.has(offer.crop) && state.contracts.active.length < 2) {
      app.acceptContract(offer.id);
      stats.contractsAccepted += 1;
    }
  }

  // Upgrade a crop only while the planned planting can't meet demand: extra yield beyond demand spoils.
  const market = targetMarket();
  let tilesByCrop = planSeeds(market);
  for (const crop of Object.keys(tilesByCrop)) {
    for (let cost = app.getUpgradeCost(crop);
      cost !== null && cost <= state.coins * 0.15 && tilesByCrop[crop] < demandTiles(market, crop);
      cost = app.getUpgradeCost(crop)) {
      app.upgradeCrop(crop);
    }
  }
  tilesByCrop = planSeeds(market);

  // Buy one pack per crop in turn, so a coin shortfall doesn't leave a variety crop without seeds.
  for (let bought = true; bought;) {
    bought = false;
    for (const [crop, tiles] of Object.entries(tilesByCrop)) {
      if (state.inventory[crop] < tiles && state.coins >= packCost(crop)) {
        app.buySeedPack(crop);
        bought = true;
      }
    }
  }

  if (state.emergencyHarvests === 0 && state.coins >= app.getEmergencyRestockCost() * 4) {
    app.restockEmergencyHarvest();
  }

  state.shopOpen = false;
  state.hand = app.createHandState(state.inventory);
}

// ---------- Careers ----------

function playCareer(seed) {
  Math.random = seededRandom(seed);
  Object.assign(state, app.createInitialGameState());
  const stats = {
    visits: 0, tilesPlanted: 0, unitsHarvested: 0, unitsSold: 0, emergencies: 0, skipped: 0, contractsAccepted: 0, contractsDelivered: 0, unitsKept: 0,
    marketUnlockVisit: {}, coinsAtVisit: [],
  };

  while (stats.visits < MAX_VISITS) {
    plantVisit(stats);
    visitMarket(stats);
    stats.visits += 1;
    stats.coinsAtVisit.push(state.coins);
    if (state.coins >= GOAL_COINS) {
      break;
    }
    if (Object.values(state.inventory).every((value) => value === 0) && state.coins < Math.min(...CROP_KEYS.filter(isUnlocked).map(packCost))) {
      stats.bankrupt = true;
      break;
    }
    shop(stats);
  }

  return { ...stats, coins: state.coins, won: state.coins >= GOAL_COINS };
}

const ageAt = (visits) => START_AGE + Math.floor(visits / VISITS_PER_YEAR);
const median = (values) => {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

const started = Date.now();
const results = Array.from({ length: RUNS }, (_, index) => playCareer(index + 1));
const winners = results.filter((result) => result.won);
const coinsByAge = (age) => median(results.map((result) => result.coinsAtVisit[(age - START_AGE) * VISITS_PER_YEAR - 1] ?? result.coins));

console.log(`Balance: ${RUNS} careers, ${TILES_PER_VISIT} tiles planted per visit (${(Date.now() - started) / 1000}s)`);
console.log(`  Reached ${GOAL_COINS.toLocaleString('en-US')} coins: ${winners.length}/${RUNS}`
  + (winners.length ? `, median age ${ageAt(median(winners.map((result) => result.visits)))}` : ''));
console.log(`  Bankrupt: ${results.filter((result) => result.bankrupt).length}/${RUNS}`);
const milestones = Object.keys(MARKET_LOCATIONS).filter((key) => MARKET_LOCATIONS[key].unlockCost > 0)
  .map((key) => ({ key, label: `${MARKET_LOCATIONS[key].label} unlocked` }));
for (const { key, label } of milestones) {
  const visits = results.map((result) => result.marketUnlockVisit[key]).filter((visit) => visit !== undefined);
  console.log(`  ${label}: ${visits.length}/${RUNS}` + (visits.length ? `, median age ${ageAt(median(visits))}` : ''));
}
console.log(`  Median coins by age: ${[25, 30, 40, 50, 60, 70, 85].map((age) => `${age}: ${Math.round(coinsByAge(age) ?? 0).toLocaleString('en-US')}`).join(' · ')}`);
const totals = results.reduce((sum, result) => ({
  tiles: sum.tiles + result.tilesPlanted,
  harvested: sum.harvested + result.unitsHarvested,
  sold: sum.sold + result.unitsSold,
  visits: sum.visits + result.visits,
  emergencies: sum.emergencies + result.emergencies,
  skipped: sum.skipped + result.skipped,
  accepted: sum.accepted + result.contractsAccepted,
  kept: sum.kept + result.unitsKept,
  delivered: sum.delivered + result.contractsDelivered,
}), { tiles: 0, harvested: 0, sold: 0, visits: 0, emergencies: 0, skipped: 0, accepted: 0, delivered: 0, kept: 0 });
console.log(`  Per visit: ${(totals.tiles / totals.visits).toFixed(0)} tiles planted, ${(totals.harvested / totals.visits).toFixed(0)} units harvested, `
  + `${(totals.sold / totals.visits).toFixed(0)} sold · emergencies per visit ${(totals.emergencies / totals.visits).toFixed(2)} · skipped seasons ${totals.skipped}`);
console.log(`  Contracts: ${totals.delivered}/${totals.accepted} delivered (${(totals.delivered / totals.visits).toFixed(2)} per visit)`);
console.log(`  Barn: ${globalThis.USE_BARN ? `${(totals.kept / totals.visits).toFixed(1)} units kept per visit` : 'not used'}`);
