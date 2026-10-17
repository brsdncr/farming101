import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';

function freshState() {
  globalThis.localStorage.clear();
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.screen = 'game';
}

test('the hold slot and the held block survive save and continue', () => {
  freshState();
  app.state.coins = 1_500;
  app.buyHoldSlot();
  app.holdBlock();
  const held = app.state.hand.hold;
  app.render();

  Object.assign(app.state, app.createInitialGameState());
  app.continueGame();

  assert.deepEqual(app.state.upgrades, { hold: true });
  assert.deepEqual(app.state.hand.hold, held);
});

test('the hold slot must be bought before blocks can be held', () => {
  freshState();
  const current = app.state.hand.slots[0];

  app.holdBlock();
  assert.equal(app.state.hand.hold, null);
  assert.equal(app.state.hand.slots[0], current);

  app.state.coins = 1_500;
  assert.equal(app.buyHoldSlot(), true);
  assert.equal(app.state.coins, 0);
  assert.equal(app.buyHoldSlot(), false, 'only bought once');
});

test('holding parks the current block, then swaps it back', () => {
  freshState();
  app.state.upgrades.hold = true;
  const [current, next] = app.state.hand.slots;

  app.holdBlock();
  assert.equal(app.state.hand.hold, current);
  assert.equal(app.state.hand.slots[0], next, 'the next block moves up');

  const newCurrent = app.state.hand.slots[0];
  app.holdBlock();
  assert.equal(app.state.hand.slots[0], current);
  assert.equal(app.state.hand.hold, newCurrent);
  assert.match(appElement.innerHTML, /Swap with current/);
});

test('seeds shown in the held block are reserved too', () => {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    freshState();
    app.state.upgrades.hold = true;
    app.state.inventory = { tomato: 6, carrot: 4, pumpkin: 0, onion: 0, beetroot: 0, cherry: 0, watermelon: 0, eggplant: 0 };
    app.state.hand = app.createHandState(app.state.inventory);
    app.holdBlock();

    const shown = {};
    for (const piece of [...app.state.hand.slots, app.state.hand.hold]) {
      for (const cell of piece.cells) {
        if (cell.cropType) {
          shown[cell.cropType] = (shown[cell.cropType] ?? 0) + 1;
        }
      }
    }
    assert.ok((shown.tomato ?? 0) <= 6);
    assert.ok((shown.carrot ?? 0) <= 4);
  }
});

test('a new season starts with an empty hold', () => {
  freshState();
  app.state.upgrades.hold = true;
  app.holdBlock();

  app.startNextSeason();

  assert.equal(app.state.hand.hold, null);
});
