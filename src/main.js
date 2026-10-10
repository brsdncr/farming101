import { createInitialGameState } from './state/gameState.js';

const state = createInitialGameState();
const app = document.querySelector('#app');

const gridMarkup = state.grid
  .map((row) => row.map((cell) => `<div class="grid-cell">${cell ?? ''}</div>`).join(''))
  .join('');

app.innerHTML = `
  <h1>Farming 101</h1>
  <div class="state-grid">
    <section class="panel">
      <h2>Game State</h2>
      <ul>
        <li>Round: <code>${state.round}</code></li>
        <li>Season: <code>${state.season}</code></li>
        <li>Coins: <code>${state.coins}</code></li>
      </ul>
    </section>

    <section class="panel">
      <h2>Inventory</h2>
      <ul>
        ${Object.entries(state.inventory)
          .filter(([key]) => key !== 'coins')
          .map(([key, value]) => `<li>${key}: <code>${value}</code></li>`)
          .join('')}
      </ul>
    </section>

    <section class="panel">
      <h2>Hand</h2>
      <ul>
        ${state.hand.slots
          .map((slot, index) => `<li>Slot ${index + 1}: ${slot.shapeType}</li>`)
          .join('')}
      </ul>
    </section>

    <section class="panel">
      <h2>Market</h2>
      <ul>
        <li>Location: <code>${state.market.location}</code></li>
        <li>Entry fee: <code>${state.market.entryFee}</code></li>
        <li>Competitors: <code>${state.market.competitors}</code></li>
      </ul>
    </section>

    <section class="panel" style="grid-column: 1 / -1;">
      <h2>Grid</h2>
      <div class="grid-preview">${gridMarkup}</div>
    </section>
  </div>
`;
