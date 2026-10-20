import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';

function freshState() {
  globalThis.localStorage.clear();
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.screen = 'game';
}

function settle() {
  const simulation = app.createSale(app.getMarketLocationProfile());
  app.state.market.simulating = true;
  app.state.market.activeSimulation = simulation;
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), simulation);
  return simulation;
}

test('the barn keeps at most its capacity, and never more than the harvest', () => {
  freshState();
  app.state.cropInventory.tomato = 25;
  app.state.cropInventory.carrot = 25;

  app.setKeep('tomato', 40);
  assert.equal(app.state.market.keep.tomato, 25, 'limited by the tomato harvest');

  app.setKeep('carrot', 20);
  assert.equal(app.state.market.keep.carrot, 5, 'limited by the 30-unit barn');

  app.adjustKeep('tomato', -5);
  assert.equal(app.state.market.keep.tomato, 20);
  app.adjustKeep('tomato', -50);
  assert.equal(app.state.market.keep.tomato, 0);
});

test('kept crops are not sold and come back next visit, minus 10% spoilage (rounded up)', () => {
  freshState();
  app.state.cropInventory.tomato = 20;
  app.state.cropInventory.carrot = 15;
  app.setKeep('tomato', 10);
  app.setKeep('carrot', 5);

  const simulation = settle();

  assert.equal(simulation.sellers[0].assortment.tomato.initialStock, 10, 'only the 10 tomatoes not kept are offered');
  assert.equal(simulation.sellers[0].assortment.carrot.initialStock, 10);
  assert.equal(app.state.cropInventory.tomato, 9, '10 kept - 1 spoiled');
  assert.equal(app.state.cropInventory.carrot, 4, '5 kept - 1 spoiled (10% rounded up)');
  assert.deepEqual(app.state.market.keep, {}, 'the keep choice resets after the sale');
  assert.match(app.state.market.lastSummary, /tomato: 10 kept in the barn \(1 spoil\)/);
});

test('contracts can not use kept units', () => {
  freshState();
  app.state.contracts.active = [{ id: 1, crop: 'tomato', locationKey: 'village', quantity: 10, reward: 165, visits: 2, lastRound: 2 }];
  app.state.cropInventory.tomato = 12;
  app.state.cropInventory.carrot = 6;
  app.setKeep('tomato', 5);

  const simulation = settle();

  assert.deepEqual(simulation.contracts, [], 'only 7 tomatoes were left for the contract');
  assert.equal(app.state.contracts.active.length, 1);
});

test('barn upgrades raise the capacity to 60 and 120 for coins', () => {
  freshState();
  app.state.coins = 2_499;
  assert.equal(app.buyBarnUpgrade(), false);

  app.state.coins = 20_000;
  assert.equal(app.buyBarnUpgrade(), true);
  assert.equal(app.getBarnCapacity(), 60);
  assert.equal(app.state.coins, 17_500);

  assert.equal(app.buyBarnUpgrade(), true);
  assert.equal(app.getBarnCapacity(), 120);
  assert.equal(app.buyBarnUpgrade(), false, 'already at the largest barn');
});

test('saves from before the barn existed load with the starting barn', () => {
  freshState();
  app.state.upgrades = { hold: true };

  assert.equal(app.getBarnCapacity(), 30);
});

test('quitting mid-sale keeps the kept crops exactly once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshState();
  app.state.cropInventory.tomato = 20;
  app.state.cropInventory.carrot = 10;
  app.setKeep('tomato', 10);
  app.startSelling();

  Object.assign(app.state, app.createInitialGameState());
  app.continueGame();

  assert.equal(app.state.cropInventory.tomato, 9);
});

test('the market panel shows the barn and a keep control per crop', () => {
  freshState();
  app.state.cropInventory.tomato = 12;
  app.state.cropInventory.onion = 4;
  app.state.marketOpen = true;
  app.setKeep('tomato', 5);

  const html = appElement.innerHTML;
  assert.match(html, /🛖 Barn: 5\/30 kept for next visit/);
  assert.match(html, /data-market-action="keep-inc"/);
  assert.match(html, /data-market-crop="onion" data-market-action="keep-inc"/, 'crops this market does not buy can be kept too');
});

test('crops kept in the barn do not count toward the variety minimum', () => {
  freshState();
  app.state.cropInventory.tomato = 20;
  app.state.cropInventory.carrot = 10;
  assert.equal(app.getVarietyCount('village'), 2);

  app.setKeep('carrot', 10);
  assert.equal(app.getVarietyCount('village'), 1, 'only tomatoes would be sold');

  app.setKeep('carrot', 7);
  assert.equal(app.getVarietyCount('village'), 2, '3 carrots on sale is enough');
});

test('the keep stepper stays on multiples of 5, capped at what can be kept', () => {
  freshState();
  app.state.cropInventory.pumpkin = 27;
  const presses = (action, times) => {
    const values = [];
    for (let press = 0; press < times; press += 1) {
      app.adjustKeep('pumpkin', action === '+' ? 5 : -5);
      values.push(app.state.market.keep.pumpkin);
    }
    return values;
  };

  assert.deepEqual(presses('+', 6), [5, 10, 15, 20, 25, 27]);
  assert.deepEqual(presses('-', 3), [25, 20, 15], 'from 27, − goes to 25, not 22');

  // The barn holds 30: with 8 carrots kept, at most 22 pumpkins fit.
  app.state.cropInventory.carrot = 8;
  app.setKeep('carrot', 8);
  assert.deepEqual(presses('+', 2), [20, 22]);
  assert.deepEqual(presses('-', 1), [20]);
});

test('the keep control shows how many kept units come back after spoilage', () => {
  freshState();
  app.state.cropInventory.pumpkin = 27;
  app.state.marketOpen = true;
  app.setKeep('pumpkin', 25);

  assert.match(appElement.innerHTML, /Keep for later: <strong>25<\/strong> <span class="keep-return"[^>]*>\(22 come back\)/);
});
