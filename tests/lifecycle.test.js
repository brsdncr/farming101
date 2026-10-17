import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers/appEnvironment.js';

const emptyCrops = () => ({ tomato: 0, carrot: 0, pumpkin: 0, onion: 0, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 });

function freshState() {
  Object.assign(app.state, app.createInitialGameState());
}

test('calendar: 2 visits per season, 4 visits per year, starting at age 20', () => {
  assert.deepEqual(app.getCalendar(0), { age: 20, season: 'summer' });
  assert.deepEqual(app.getCalendar(1), { age: 20, season: 'summer' });
  assert.deepEqual(app.getCalendar(2), { age: 20, season: 'winter' });
  assert.deepEqual(app.getCalendar(3), { age: 20, season: 'winter' });
  assert.deepEqual(app.getCalendar(4), { age: 21, season: 'summer' });
  assert.equal(app.getCalendar(260).age, 85);
});

test('a finished sale advances time once', () => {
  freshState();
  app.state.market.simulating = true;
  const simulation = { sellers: [{ revenue: 0, crops: {}, cropSales: {} }], totalCustomers: 0, totalRequested: 0, totalSold: 0, totalRevenue: 0 };
  app.state.market.activeSimulation = simulation;

  app.finalizeMarketSimulation({ label: 'Village' }, simulation);
  app.finalizeMarketSimulation({ label: 'Village' }, simulation);

  assert.equal(app.state.round, 2);
  for (let visit = 0; visit < 3; visit += 1) {
    app.advanceTime();
  }
  assert.equal(app.state.age, 21);
  assert.equal(app.state.season, 'summer');
});

test('reaching a million coins wins and reports the age', () => {
  freshState();
  app.state.coins = 1_000_000;
  app.state.age = 34;

  assert.equal(app.checkForGameOver(), true);
  assert.equal(app.state.gameResult, 'won');
  assert.match(app.state.gameOverReason, /age 34/);
});

test('turning 85 ends the game', () => {
  freshState();
  for (let visit = 0; visit < 260; visit += 1) {
    app.advanceTime();
  }

  assert.equal(app.state.age, 85);
  assert.equal(app.checkForGameOver(), true);
  assert.equal(app.state.gameResult, 'died');
});

test('low coins alone no longer end the game', () => {
  freshState();
  app.state.coins = 0;

  assert.equal(app.checkForGameOver(), false);
});

test('bankrupt only with no seeds, no harvest, an empty field and too few coins for seeds', () => {
  freshState();
  app.state.inventory = emptyCrops();
  app.state.coins = 10;
  assert.equal(app.checkForGameOver(), false, 'can still afford a seed pack');

  app.state.coins = 9;
  app.state.grid[0][0] = 'tomato';
  assert.equal(app.checkForGameOver(), false, 'still has crops in the field');

  app.state.grid[0][0] = null;
  assert.equal(app.checkForGameOver(), true);
  assert.equal(app.state.gameResult, 'bankrupt');
});

test('game end waits until the sale screen is closed', () => {
  freshState();
  app.state.coins = 1_000_000;
  app.state.market.saleScreenOpen = true;

  assert.equal(app.checkForGameOver(), false);

  app.state.market.saleScreenOpen = false;
  assert.equal(app.checkForGameOver(), true);
});

test('skip season is only allowed when no unlocked market accepts the harvest', () => {
  freshState();
  app.state.cropInventory = { ...emptyCrops(), tomato: 10, carrot: 10 };

  app.skipSeason();
  assert.equal(app.state.round, 1, 'the Village accepts tomato + carrot');

  app.state.cropInventory = { ...emptyCrops(), tomato: 10 };
  app.state.grid[2][2] = 'carrot';
  app.skipSeason();

  assert.equal(app.state.round, 2);
  assert.ok(Object.values(app.state.cropInventory).every((value) => value === 0));
  assert.equal(app.state.grid[2][2], null);
  assert.equal(app.state.shopOpen, true);
});
