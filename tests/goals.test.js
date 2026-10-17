import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';

function freshState() {
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.screen = 'game';
}

test('next goal starts with the cheapest crop an open market buys', () => {
  freshState();

  const goal = app.getNextGoal();

  assert.equal(goal.label, 'Pumpkin');
  assert.equal(goal.cost, 250);
  assert.equal(goal.ready, false);
  assert.ok(Math.abs(goal.progress - 20 / 250) < 1e-9);
});

test('crops only sold in locked markets are skipped until that market opens', () => {
  freshState();
  app.state.seedLevels.pumpkin = 1;
  app.state.seedLevels.beetroot = 1;

  assert.equal(app.getNextGoal().label, 'Town market');

  app.state.unlockedMarkets.town = true;
  assert.equal(app.getNextGoal().label, 'Onion');
});

test('next goal is ready once affordable, and becomes the coin goal when everything is unlocked', () => {
  freshState();
  app.state.coins = 300;
  assert.equal(app.getNextGoal().ready, true);

  for (const crop of Object.keys(app.state.seedLevels)) {
    app.state.seedLevels[crop] = 1;
  }
  Object.keys(app.state.unlockedMarkets).forEach((key) => { app.state.unlockedMarkets[key] = true; });
  app.state.coins = 250_000;

  const goal = app.getNextGoal();
  assert.equal(goal.label, 'Millionaire');
  assert.equal(goal.progress, 0.25);
});

test('the HUD shows the next goal with progress', () => {
  freshState();
  app.state.coins = 125;

  app.render();

  assert.match(appElement.innerHTML, /Next: Pumpkin/);
  assert.match(appElement.innerHTML, /125 \/ 250/);
  assert.match(appElement.innerHTML, /width:50%/);
});
