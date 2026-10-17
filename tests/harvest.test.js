import test from 'node:test';
import assert from 'node:assert/strict';
import { createGrid, findAllConnectedGroups } from '../src/state/gridState.js';

// Builds a grid from rows of single letters: T = tomato, C = carrot, P = pumpkin, . = empty.
function gridFrom(rows) {
  const names = { T: 'tomato', C: 'carrot', P: 'pumpkin' };
  const grid = createGrid(rows.length, rows[0].length);
  rows.forEach((line, row) => [...line].forEach((char, col) => {
    grid[row][col] = names[char] ?? null;
  }));
  return grid;
}

const summarize = (groups) => groups.map((group) => `${group.cropType}:${group.cells.length}`);

test('finds every orthogonally connected group once', () => {
  const grid = gridFrom([
    'TT.C',
    'T..C',
    '.T.T',
  ]);

  assert.deepEqual(summarize(findAllConnectedGroups(grid)), ['tomato:3', 'carrot:2', 'tomato:1', 'tomato:1']);
});

test('an empty field has no groups', () => {
  assert.deepEqual(findAllConnectedGroups(createGrid(6, 6)), []);
});
