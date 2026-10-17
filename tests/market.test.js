import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers/appEnvironment.js';

// Small deterministic PRNG (mulberry32) so simulations are reproducible.
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freshState() {
  Object.assign(app.state, app.createInitialGameState());
}

test('70% of customers buy at the base price; fewer above it, more below it', () => {
  assert.ok(Math.abs(app.getBuyChance(10, 10) - 0.7) < 1e-9);
  assert.ok(Math.abs(app.getBuyChance(15, 10) - 0.24) < 0.01);
  assert.ok(Math.abs(app.getBuyChance(5, 10) - 0.94) < 0.01);
  assert.ok(app.getBuyChance(11, 10) < app.getBuyChance(10, 10));
  assert.ok(app.getBuyChance(30, 10) > 0);
  assert.ok(app.getBuyChance(1, 10) < 1);
});

test('variety counts only crops the market buys with at least 3 units', () => {
  freshState();
  app.state.cropInventory.tomato = 10;
  app.state.cropInventory.carrot = 2;
  app.state.cropInventory.onion = 9;

  // carrot has too few units; onion is not bought in the Village.
  assert.equal(app.getVarietyCount('village'), 1);
  assert.equal(app.getVarietyCount('town'), 2);
});

test('selling is blocked until the variety minimum is met', () => {
  freshState();
  app.state.cropInventory.tomato = 10;
  app.state.cropInventory.carrot = 2;

  app.startSelling();

  assert.equal(app.state.market.saleScreenOpen, false);
  assert.match(app.state.market.lastSummary, /needs 2 crop types/);
});

test('markets start locked except the Village and are unlocked with coins', () => {
  freshState();
  assert.deepEqual(app.state.unlockedMarkets, { village: true, town: false, city: false });

  app.state.coins = 1999;
  assert.equal(app.unlockMarket('town'), false);

  app.state.coins = 2500;
  assert.equal(app.unlockMarket('town'), true);
  assert.equal(app.state.coins, 500);
  assert.equal(app.state.unlockedMarkets.town, true);
  assert.equal(app.unlockMarket('town'), false);
});

test('a locked market cannot be used for selling', () => {
  freshState();
  app.state.market.location = 'town';
  app.state.cropInventory.tomato = 10;
  app.state.cropInventory.carrot = 10;
  app.state.cropInventory.pumpkin = 10;

  app.startSelling();

  assert.equal(app.state.market.saleScreenOpen, false);
  assert.match(app.state.market.lastSummary, /locked/);
});

test('simulation has no rivals, only offers the crops brought, and never oversells', () => {
  freshState();
  app.state.cropInventory.tomato = 5;
  app.state.cropInventory.carrot = 40;
  const profile = app.getMarketLocationProfile();

  const simulation = app.buildMarketCustomerSimulation(profile, ['tomato', 'carrot'], { random: seededRandom(42) });
  const [player] = simulation.sellers;

  assert.equal(simulation.sellers.length, 1);
  assert.deepEqual(Object.keys(player.assortment).sort(), ['carrot', 'tomato']);
  assert.ok((player.crops.tomato ?? 0) <= 5);
  assert.ok((player.crops.carrot ?? 0) <= 40);
  assert.equal(player.sold, simulation.events.filter((event) => event.sold).length);
  assert.ok(simulation.events.every((event) => ['tomato', 'carrot'].includes(event.crop)));
});

test('simulation is reproducible for a fixed random source', () => {
  freshState();
  app.state.cropInventory.tomato = 30;
  app.state.cropInventory.carrot = 30;
  const profile = app.getMarketLocationProfile();

  const first = app.buildMarketCustomerSimulation(profile, ['tomato', 'carrot'], { random: seededRandom(7) });
  const second = app.buildMarketCustomerSimulation(profile, ['tomato', 'carrot'], { random: seededRandom(7) });

  assert.equal(first.totalSold, second.totalSold);
  assert.equal(first.totalRevenue, second.totalRevenue);
});

test('higher prices sell fewer units on average', () => {
  freshState();
  app.state.cropInventory.tomato = 500;
  app.state.cropInventory.carrot = 500;
  const profile = app.getMarketLocationProfile();
  const soldAt = (tomatoPrice) => {
    app.state.market.prices.tomato = tomatoPrice;
    let sold = 0;
    for (let seed = 1; seed <= 40; seed += 1) {
      sold += app.buildMarketCustomerSimulation(profile, ['tomato'], { random: seededRandom(seed) }).sellers[0].crops.tomato ?? 0;
    }
    return sold;
  };

  assert.ok(soldAt(12) < soldAt(8));
});
