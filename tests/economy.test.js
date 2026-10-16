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

const emptyInventory = () => ({ tomato: 0, carrot: 0, pumpkin: 0, onion: 0, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 });

test('harvest adds the seed level bonus once per harvest action', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.coins = 20;
  app.state.seedLevels.tomato = 3;
  app.state.grid[0][0] = 'tomato';
  app.state.grid[0][1] = 'tomato';
  app.state.highlightedGroup = [{ row: 0, col: 0 }, { row: 0, col: 1 }];

  app.harvestSelectedGroup();

  assert.equal(app.state.cropInventory.tomato, 2 + 2);
  assert.equal(app.state.coins, 15);
  assert.equal(app.state.grid[0][0], null);
});

test('hand slots never show more seeds than the inventory holds', () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const inventory = { ...emptyInventory(), tomato: 3, carrot: 2 };
    const hand = app.createHandState(inventory);
    const shown = {};

    for (const slot of hand.slots) {
      for (const cell of slot.cells) {
        if (cell.cropType) {
          shown[cell.cropType] = (shown[cell.cropType] ?? 0) + 1;
        }
      }
    }

    assert.ok((shown.tomato ?? 0) <= 3);
    assert.ok((shown.carrot ?? 0) <= 2);
  }
});

test('low stock still draws a full four-block shape with unfilled blocks', () => {
  const hand = app.createHandState({ ...emptyInventory(), tomato: 2 });
  const [first] = hand.slots;

  assert.equal(first.cells.length, 4);
  assert.equal(first.cells.filter((cell) => cell.cropType === 'tomato').length, 2);
  assert.equal(first.cells.filter((cell) => cell.cropType === null).length, 2);
});

test('skipping the sale animation stops the customer loop', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  Object.assign(app.state, app.createInitialGameState());
  app.state.coins = 100;
  app.state.cropInventory.tomato = 10;
  app.state.market.selectedQuantities.tomato = 10;

  app.startSelling();
  t.mock.timers.tick(3000);

  const simulation = app.state.market.activeSimulation;
  app.state.market.skipAnimation = true;
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), simulation, app.state.market.activeSelectedCrops);
  const indexAfterSkip = app.state.market.currentCustomerIndex;
  const summaryAfterSkip = app.state.market.lastSummary;

  t.mock.timers.tick(60000);

  assert.equal(app.state.market.currentCustomerIndex, indexAfterSkip);
  assert.equal(app.state.market.lastSummary, summaryAfterSkip);
});

test('hand holds a current and a next block; Next swaps them', () => {
  Object.assign(app.state, app.createInitialGameState());
  const [current, next] = app.state.hand.slots;

  assert.equal(app.state.hand.slots.length, 2);

  app.swapHandBlocks();

  assert.equal(app.state.hand.slots[0], next);
  assert.equal(app.state.hand.slots[1], current);
});

test('placing the current block promotes the next block and draws a new one', () => {
  Object.assign(app.state, app.createInitialGameState());
  const next = app.state.hand.slots[1];

  app.advanceHand();

  assert.equal(app.state.hand.slots[0], next);
  assert.notEqual(app.state.hand.slots[1], next);
  assert.equal(app.state.hand.slots[1].cells.length, 4);
});

test('hand cards render only the block cells, without the shape type', () => {
  Object.assign(app.state, app.createInitialGameState());

  app.render();

  const html = appElement.innerHTML;
  assert.equal(html.match(/class="slot-cell/g)?.length, 8);
  assert.match(html, /<div class="shape-name">Current<\/div>/);
  assert.match(html, /<div class="shape-name">Next<\/div>/);
  assert.match(html, /<div class="shape-name">Current<\/div>[\s\S]*id="hand-next-button"[\s\S]*<div class="shape-name">Next<\/div>/);
  assert.match(html, /aria-label="Swap">🔁<\/button>/);
});
