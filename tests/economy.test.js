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

  assert.match(appElement.innerHTML, /Lv 3</);
  assert.match(appElement.innerHTML, /Lv 0</);
});

test('market settlement pays revenue once, keeps seeds unchanged, and clears all harvested crops', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.inventory = { tomato: 5, carrot: 0, pumpkin: 0, onion: 0, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 };
  // onion is not bought in the Village, so it spoils along with unsold tomatoes.
  app.state.cropInventory = { tomato: 20, carrot: 0, pumpkin: 0, onion: 4, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 };
  app.state.coins = 100;
  app.state.market.simulating = true;

  const profile = { label: 'Village' };
  const simulation = {
    sellers: [{
      name: 'You',
      customers: 6,
      requested: 6,
      sold: 6,
      revenue: 48,
      crops: { tomato: 6 },
      cropSales: { tomato: { quantity: 6, price: 8, revenue: 48 } },
    }],
    totalCustomers: 6,
    totalRequested: 6,
    totalSold: 6,
    totalRevenue: 48,
  };
  app.state.market.activeSimulation = simulation;
  app.finalizeMarketSimulation(profile, simulation);
  app.finalizeMarketSimulation(profile, simulation);

  assert.equal(app.state.inventory.tomato, 5);
  assert.ok(Object.values(app.state.cropInventory).every((value) => value === 0));
  assert.equal(app.state.coins, 100 + 48);
  assert.match(app.state.market.lastSummary, /onion: 4 spoiled/);
});

const emptyInventory = () => ({ tomato: 0, carrot: 0, pumpkin: 0, onion: 0, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 });

test('groups of five or more are auto-harvested with the level bonus; smaller groups stay', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.coins = 20;
  app.state.seedLevels.tomato = 3;
  for (let col = 0; col < 5; col += 1) {
    app.state.grid[0][col] = 'tomato';
  }
  for (let col = 0; col < 4; col += 1) {
    app.state.grid[2][col] = 'carrot';
  }

  app.autoHarvest();

  // tomato: 5 tiles × 1.3 (level 3) = 6.5, rounded
  assert.equal(app.state.cropInventory.tomato, 7);
  assert.equal(app.state.cropInventory.carrot, 0);
  assert.ok(app.state.grid[0].every((cell) => cell === null));
  assert.equal(app.state.grid[2][0], 'carrot');
  assert.equal(app.state.coins, 20);
  assert.match(app.state.harvestFeedback, /Auto-harvested/);
});

test('emergency harvest clears the whole field once, without level bonus', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.seedLevels.tomato = 3;
  app.state.grid[0][0] = 'tomato';
  app.state.grid[3][3] = 'carrot';
  app.state.grid[3][4] = 'carrot';

  app.emergencyHarvest();

  assert.equal(app.state.cropInventory.tomato, 1);
  assert.equal(app.state.cropInventory.carrot, 2);
  assert.ok(app.state.grid.every((row) => row.every((cell) => cell === null)));
  assert.equal(app.state.emergencyHarvests, 0);

  app.state.grid[1][1] = 'tomato';
  app.emergencyHarvest();

  assert.equal(app.state.grid[1][1], 'tomato');
  assert.equal(app.state.cropInventory.tomato, 1);
});

test('emergency harvest is restocked in the shop for coins, holding at most one', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.coins = 100;

  assert.equal(app.restockEmergencyHarvest(), false);

  app.state.emergencyHarvests = 0;
  assert.equal(app.restockEmergencyHarvest(), true);
  assert.equal(app.state.emergencyHarvests, 1);
  assert.equal(app.state.coins, 50);

  app.state.emergencyHarvests = 0;
  app.state.coins = 49;
  assert.equal(app.restockEmergencyHarvest(), false);
  assert.equal(app.state.emergencyHarvests, 0);
});

test('emergency restock costs the larger of 50 coins or 2% of coins', () => {
  Object.assign(app.state, app.createInitialGameState());

  assert.equal(app.getEmergencyRestockCost(1_000), 50);
  assert.equal(app.getEmergencyRestockCost(100_000), 2_000);

  app.state.emergencyHarvests = 0;
  app.state.coins = 100_000;
  assert.equal(app.restockEmergencyHarvest(), true);
  assert.equal(app.state.coins, 98_000);
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
  app.state.cropInventory.carrot = 5;

  app.startSelling();
  assert.equal(app.state.market.saleScreenOpen, true);
  t.mock.timers.tick(3000);

  const simulation = app.state.market.activeSimulation;
  app.state.market.skipAnimation = true;
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), simulation);
  const coinsAfterSkip = app.state.coins;
  const roundAfterSkip = app.state.round;
  const summaryAfterSkip = app.state.market.lastSummary;

  t.mock.timers.tick(60000);

  assert.equal(app.state.coins, coinsAfterSkip, 'the sale is paid once');
  assert.equal(app.state.round, roundAfterSkip);
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
