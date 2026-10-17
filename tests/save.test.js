import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';
import { BEST_KEY, SAVE_KEY, restoreGame, serializeGame } from '../src/state/saveState.js';

const stored = (key) => JSON.parse(globalThis.localStorage.getItem(key));

function freshGame() {
  globalThis.localStorage.clear();
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.screen = 'game';
  app.uiState.confirmNewGame = false;
}

test('a save keeps progress but drops UI-only state', () => {
  freshGame();
  app.state.coins = 1234;
  app.state.grid[2][3] = 'carrot';
  app.state.marketOpen = true;
  app.state.harvestFeedback = 'Auto-harvested: 🍅 5';

  const save = serializeGame(app.state);

  assert.equal(save.state.coins, 1234);
  assert.equal(save.state.grid[2][3], 'carrot');
  assert.equal('marketOpen' in save.state, false);
  assert.equal('harvestFeedback' in save.state, false);
});

test('restoring fills fields missing from older saves with defaults and rejects unknown versions', () => {
  freshGame();
  const save = serializeGame(app.state);
  delete save.state.combo;
  delete save.state.market.prices;

  const restored = restoreGame(save, app.createInitialGameState());

  assert.equal(restored.combo, 0);
  assert.equal(restored.market.prices.tomato, app.createMarketState().prices.tomato);
  assert.equal(restoreGame({ ...save, version: 999 }, app.createInitialGameState()), null);
  assert.equal(restoreGame(null, app.createInitialGameState()), null);
});

test('rendering the farm autosaves, and Continue restores the run', () => {
  freshGame();
  app.state.coins = 777;
  app.state.grid[1][1] = 'tomato';
  app.render();

  assert.equal(stored(SAVE_KEY).state.coins, 777);

  Object.assign(app.state, app.createInitialGameState());
  app.continueGame();

  assert.equal(app.state.coins, 777);
  assert.equal(app.state.grid[1][1], 'tomato');
  assert.equal(app.uiState.screen, 'game');
});

test('quitting during a sale cannot re-roll it: Continue settles the saved result', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshGame();
  app.state.cropInventory.tomato = 10;
  app.state.cropInventory.carrot = 10;

  app.startSelling();
  const savedSale = stored(SAVE_KEY).state.market.activeSimulation;
  assert.ok(savedSale, 'the sale result is saved when selling starts');

  // Simulate closing the game mid-animation and continuing later.
  Object.assign(app.state, app.createInitialGameState());
  app.continueGame();

  assert.equal(app.state.coins, 20 + savedSale.sellers[0].revenue);
  assert.equal(app.state.round, 2);
  assert.equal(app.state.market.saleComplete, true);
  assert.equal(app.state.market.saleScreenOpen, true);
  assert.equal(stored(SAVE_KEY).state.market.simulating, false);
});

test('finishing a game clears the save and keeps the best result', () => {
  freshGame();
  app.render();
  app.state.coins = 1_000_000;
  app.state.age = 40;
  app.render();

  assert.equal(globalThis.localStorage.getItem(SAVE_KEY), null);
  assert.equal(stored(BEST_KEY).millionaireAge, 40);

  freshGame();
  globalThis.localStorage.setItem(BEST_KEY, JSON.stringify({ millionaireAge: 40, highestCoins: 1_000_000 }));
  app.state.coins = 1_200_000;
  app.state.age = 45;
  app.render();

  assert.equal(stored(BEST_KEY).millionaireAge, 40, 'an older millionaire does not replace the best age');
  assert.equal(stored(BEST_KEY).highestCoins, 1_200_000);
});

test('main menu offers Continue only when a save exists, and shows the best result', () => {
  freshGame();
  app.uiState.screen = 'menu';
  app.render();
  assert.doesNotMatch(appElement.innerHTML, /menu-continue/);
  assert.match(appElement.innerHTML, /New Game/);

  globalThis.localStorage.setItem(BEST_KEY, JSON.stringify({ millionaireAge: 52 }));
  app.uiState.screen = 'game';
  app.state.coins = 4321;
  app.render();
  app.uiState.screen = 'menu';
  app.render();

  assert.match(appElement.innerHTML, /menu-continue/);
  assert.match(appElement.innerHTML, /4,321 coins/);
  assert.match(appElement.innerHTML, /Best: millionaire at age 52/);
});

test('New Game starts fresh and replaces the old save', () => {
  freshGame();
  app.state.coins = 999;
  app.render();

  app.startNewGame();

  assert.equal(app.state.coins, 20);
  assert.equal(stored(SAVE_KEY).state.coins, 20);
});
