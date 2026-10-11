import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';

test('initial state keeps seeds separate from harvested crop inventory', () => {
  const initialState = app.createInitialGameState();

  assert.ok(initialState.inventory.tomato > 0);
  assert.equal(initialState.cropInventory.tomato, 0);
  assert.ok(Object.values(initialState.inventory).some((value) => value > 0));
  assert.ok(Object.values(initialState.cropInventory).every((value) => value === 0));
});

test('inventory displays each crop level', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.seedLevels.tomato = 3;
  app.state.seedLevels.pumpkin = 0;

  app.render();

  assert.match(appElement.innerHTML, /Level: 3/);
  assert.match(appElement.innerHTML, /Level: 0/);
});

test('market settlement pays player revenue once, returns leftovers as seeds, and clears crop stock', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.inventory = { tomato: 5, carrot: 0, pumpkin: 0, onion: 0, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 };
  app.state.cropInventory = { tomato: 20, carrot: 0, pumpkin: 0, onion: 0, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 };
  app.state.coins = 100;
  app.state.market = app.createMarketState();
  app.state.market.crop = 'tomato';
  app.state.market.selectedQuantities.tomato = 10;
  app.state.market.prices.tomato = 8;
  app.state.market.simulating = true;

  const profile = { label: 'Village', entryFee: 5 };
  const simulation = {
    sellers: [{
      name: 'You',
      customers: 1,
      requested: 1,
      sold: 6,
      revenue: 48,
      crops: { tomato: 6 },
    }],
    totalCustomers: 1,
    totalRequested: 1,
    totalSold: 6,
    totalRevenue: 48,
  };
  app.state.market.activeSimulation = simulation;
  app.finalizeMarketSimulation(profile, simulation, ['tomato']);
  app.finalizeMarketSimulation(profile, simulation, ['tomato']);

  assert.equal(app.state.inventory.tomato, 15);
  assert.equal(app.state.cropInventory.tomato, 0);
  assert.equal(app.state.market.selectedQuantities.tomato, 0);
  assert.equal(app.state.coins, 100 + 48 - 5);
});

test('game over triggers only when coins cannot cover harvest', () => {
  app.state.coins = 4;
  app.state.gameOver = false;

  const result = app.checkForGameOver();

  assert.equal(result, true);
  assert.equal(app.state.gameOver, true);
});

test('city entry fee alone does not trigger game over', () => {
  app.state.coins = 10;
  app.state.gameOver = false;
  app.state.market.location = 'city';

  const result = app.checkForGameOver();

  assert.equal(result, false);
  assert.equal(app.state.gameOver, false);
});

test('slider quantity updates without forcing a full render', () => {
  app.state.cropInventory.tomato = 12;
  app.state.market.selectedQuantities.tomato = 0;
  app.state.market.crop = 'tomato';
  appElement.renderCount = 0;

  app.setMarketQuantity(7, 'tomato', false);

  assert.equal(app.state.market.selectedQuantities.tomato, 7);
  assert.equal(appElement.renderCount, 0);
});
