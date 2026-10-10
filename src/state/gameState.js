import { createGrid } from './gridState.js';
import { createInventoryState } from './inventoryState.js';
import { createHandState } from './handState.js';
import { createMarketState } from './marketState.js';

export function createInitialGameState() {
  const inventory = createInventoryState();
  const hand = createHandState(inventory);

  return {
    round: 1,
    season: 'summer',
    coins: 0,
    grid: createGrid(6, 6),
    inventory,
    hand,
    market: createMarketState(),
  };
}
