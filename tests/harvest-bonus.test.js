import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers/appEnvironment.js';

function freshState() {
  Object.assign(app.state, app.createInitialGameState());
}

function plantRow(row, crop, count, startCol = 0) {
  for (let col = startCol; col < startCol + count; col += 1) {
    app.state.grid[row][col] = crop;
  }
}

test('bigger groups yield more per tile', () => {
  freshState();

  assert.equal(app.getHarvestYield('tomato', 5), 5);
  assert.equal(app.getHarvestYield('tomato', 7), 7);
  assert.equal(app.getHarvestYield('tomato', 8), 12, 'Big ×1.5 from 8 tiles');
  assert.equal(app.getHarvestYield('tomato', 12), 24, 'Huge ×2 from 12 tiles');
  assert.equal(app.getHarvestYield('tomato', 8, { withBonuses: false }), 8);
});

test('seed level adds 15% yield per level above 1', () => {
  freshState();
  app.state.seedLevels.tomato = 3;
  assert.equal(app.getHarvestYield('tomato', 10), 20, '10 tiles × 1.5 (Big) × 1.3 (level 3) = 19.5');

  app.state.seedLevels.tomato = 10;
  assert.equal(app.getHarvestYield('tomato', 5), 12, '5 × 2.35 = 11.75');
});

test('one big group now beats two small groups of the same tiles', () => {
  freshState();
  app.state.seedLevels.tomato = 10;

  assert.ok(app.getHarvestYield('tomato', 10) > 2 * app.getHarvestYield('tomato', 5));
});

test('combo adds 10% per group harvested in a row, capped at ×2', () => {
  freshState();

  assert.equal(app.getHarvestYield('tomato', 10, { combo: 1 }), 15);
  assert.equal(app.getHarvestYield('tomato', 10, { combo: 3 }), 18, '15 × 1.2');
  assert.equal(app.getHarvestYield('tomato', 10, { combo: 11 }), 30, '15 × 2');
  assert.equal(app.getHarvestYield('tomato', 10, { combo: 30 }), 30, 'capped at ×2');
});

test('consecutive harvesting placements build a combo; a placement without a harvest resets it', () => {
  freshState();

  plantRow(0, 'tomato', 5);
  app.autoHarvest();
  assert.equal(app.state.combo, 1);
  assert.equal(app.state.cropInventory.tomato, 5);

  plantRow(2, 'carrot', 5);
  app.autoHarvest();
  assert.equal(app.state.combo, 2);
  assert.equal(app.state.cropInventory.carrot, 6, '5 × 1.1 = 5.5, rounded');
  assert.match(app.state.harvestFeedback, /Combo ×1\.1/);

  app.state.grid[4][0] = 'tomato';
  app.autoHarvest();
  assert.equal(app.state.combo, 0);
});

test('several groups harvested by one placement each extend the combo', () => {
  freshState();
  plantRow(0, 'tomato', 5);
  plantRow(2, 'carrot', 5);

  app.autoHarvest();

  assert.equal(app.state.combo, 2);
  assert.equal(app.state.cropInventory.tomato, 5);
  assert.equal(app.state.cropInventory.carrot, 6);
});

test('a big group is labelled and flashed on the board', () => {
  freshState();
  plantRow(0, 'tomato', 4);
  plantRow(1, 'tomato', 4);

  app.autoHarvest();

  assert.equal(app.state.cropInventory.tomato, 12);
  assert.match(app.state.harvestFeedback, /Big ×1\.5/);
  assert.equal(app.state.harvestFlash.cells.length, 8);
  assert.equal(app.state.harvestFlash.text, '+12');
});

test('emergency harvest and a new season reset the combo', () => {
  freshState();
  app.state.combo = 4;
  app.state.grid[0][0] = 'tomato';

  app.emergencyHarvest();
  assert.equal(app.state.combo, 0);

  app.state.combo = 3;
  app.startNextSeason();
  assert.equal(app.state.combo, 0);
});
