import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';

function freshState() {
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.screen = 'game';
}

test('customers pay 20% more for crops in season and 20% less out of season', () => {
  freshState();
  assert.equal(app.state.season, 'summer');
  assert.ok(Math.abs(app.getReferencePrice('village', 'tomato') - 11 * 1.2) < 1e-9, 'tomato is a summer crop');
  assert.ok(Math.abs(app.getReferencePrice('village', 'carrot') - 8 * 0.8) < 1e-9, 'carrot is a winter crop');

  app.advanceTime();
  app.advanceTime();
  assert.equal(app.state.season, 'winter');
  assert.ok(Math.abs(app.getReferencePrice('village', 'tomato') - 11 * 0.8) < 1e-9);
  assert.ok(Math.abs(app.getReferencePrice('village', 'carrot') - 8 * 1.2) < 1e-9);
});

test('the season and market flooding combine', () => {
  freshState();
  app.state.market.flood = { town: { carrot: 0.25 } };
  assert.ok(Math.abs(app.getReferencePrice('town', 'carrot') - 8 * 0.8 * 0.75) < 1e-9);
});

test('the market panel shows each crop as in or out of season', () => {
  freshState();
  app.state.cropInventory.tomato = 10;
  app.state.cropInventory.carrot = 10;
  app.state.marketOpen = true;
  app.render();

  assert.match(appElement.innerHTML, /season-chip in-season[^>]*>☀️ Summer crop · \+20%/);
  assert.match(appElement.innerHTML, /season-chip off-season[^>]*>❄️ Winter crop · −20%/);
});

test('the top bar shows the season and warns on its last visit', () => {
  freshState();
  app.render();
  assert.match(appElement.innerHTML, /☀️ Summer(?! <small>)/);

  app.advanceTime();
  app.render();
  assert.match(appElement.innerHTML, /☀️ Summer <small>\(last visit\)<\/small>/);
});

test('the Seed Shop marks crops that will be in season at the next visit', () => {
  freshState();
  app.state.seedLevels.carrot = 1;
  app.advanceTime();
  app.advanceTime();
  app.state.shopOpen = true;
  app.render();

  assert.match(appElement.innerHTML, /shop-tile-badge" aria-hidden="true">❄️<\/span>\s*<span class="shop-tile-icon" aria-hidden="true">🥕/);
  assert.doesNotMatch(appElement.innerHTML, /❄️<\/span>\s*<span class="shop-tile-icon" aria-hidden="true">🍅/);
});
