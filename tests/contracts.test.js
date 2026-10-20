import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';

function freshState() {
  globalThis.localStorage.clear();
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.screen = 'game';
}

// Always picks the first remaining option and the shortest deadline.
const firstChoice = () => 0;

function acceptVillageContract({ crop = 'tomato', quantity = 10, visits = 2 } = {}) {
  app.state.contracts.offers = [{ id: 99, crop, locationKey: 'village', quantity, reward: Math.round(quantity * 11 * 1.5), visits }];
  assert.equal(app.acceptContract(99), true);
  return app.state.contracts.active.at(-1);
}

test('offers target unlocked crops at open markets and scale with the last harvest', () => {
  freshState();

  app.generateContractOffers(firstChoice);
  assert.equal(app.state.contracts.offers.length, 2);
  for (const offer of app.state.contracts.offers) {
    assert.ok(['tomato', 'carrot'].includes(offer.crop));
    assert.equal(offer.locationKey, 'village');
    assert.equal(offer.quantity, 10, 'minimum quantity with no harvest history');
    assert.equal(offer.reward, Math.round(offer.quantity * app.createMarketState().prices[offer.crop] * 1.5));
    assert.equal(offer.visits, 2);
  }

  app.state.lastHarvestUnits = 100;
  app.generateContractOffers(firstChoice);
  assert.equal(app.state.contracts.offers[0].quantity, 30);
});

test('offers ask for crops harvested at the last market visit when there is a history', () => {
  freshState();
  app.state.seedLevels.pumpkin = 1;
  app.state.lastHarvestCrops = ['pumpkin'];

  app.generateContractOffers(firstChoice);

  assert.equal(app.state.contracts.offers.length, 1);
  assert.equal(app.state.contracts.offers[0].crop, 'pumpkin');
});

test('a new season brings fresh offers that skip active contracts', () => {
  freshState();
  acceptVillageContract({ crop: 'tomato' });

  app.startNextSeason();

  assert.equal(app.state.contracts.offers.length, 1, 'only carrot @ village is left to offer');
  assert.equal(app.state.contracts.offers[0].crop, 'carrot');
});

test('at most two contracts can be active', () => {
  freshState();
  acceptVillageContract({ crop: 'tomato' });
  acceptVillageContract({ crop: 'carrot' });

  app.state.contracts.offers = [{ id: 7, crop: 'tomato', locationKey: 'village', quantity: 10, reward: 220, visits: 3 }];
  assert.equal(app.acceptContract(7), false);
  assert.equal(app.state.contracts.active.length, 2);
});

test('selling at the contract market delivers the units first and pays the reward once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshState();
  const contract = acceptVillageContract({ crop: 'tomato', quantity: 10 });
  app.state.cropInventory.tomato = 14;
  app.state.cropInventory.carrot = 6;

  app.startSelling();
  const simulation = app.state.market.activeSimulation;
  assert.deepEqual(simulation.contracts.map((delivered) => delivered.id), [contract.id]);
  assert.equal(simulation.sellers[0].assortment.tomato.initialStock, 4, 'only the 4 extra tomatoes are offered to customers');

  const coinsBefore = app.state.coins;
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), simulation);
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), simulation);

  assert.equal(app.state.coins, coinsBefore + contract.reward + simulation.sellers[0].revenue);
  assert.equal(app.state.contracts.active.length, 0);
  assert.equal(app.state.lastHarvestUnits, 20);
  assert.match(appElement.innerHTML, /Contracts delivered/);
});

test('contracts are not delivered with too few units or at another market', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshState();
  acceptVillageContract({ crop: 'tomato', quantity: 10, visits: 3 });
  app.state.cropInventory.tomato = 9;
  app.state.cropInventory.carrot = 6;

  app.startSelling();

  assert.deepEqual(app.state.market.activeSimulation.contracts, []);
  assert.equal(app.state.contracts.active.length, 1);
});

test('contracts expire after their last deliverable visit', () => {
  freshState();
  const contract = acceptVillageContract({ visits: 2 });
  assert.equal(contract.lastRound, app.state.round + 1);

  app.advanceTime();
  assert.equal(app.state.contracts.active.length, 1, 'one visit left');

  app.advanceTime();
  assert.equal(app.state.contracts.active.length, 0);
});

test('quitting mid-sale keeps a delivered contract paid exactly once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshState();
  const contract = acceptVillageContract({ crop: 'carrot', quantity: 10 });
  app.state.cropInventory.tomato = 6;
  app.state.cropInventory.carrot = 10;
  app.startSelling();
  const revenue = app.state.market.activeSimulation.sellers[0].revenue;

  Object.assign(app.state, app.createInitialGameState());
  app.continueGame();

  assert.equal(app.state.coins, 20 + contract.reward + revenue);
  assert.equal(app.state.contracts.active.length, 0);
});

test('units on sale match what the sale offers, after kept units and contracts', () => {
  const cases = [
    { tomato: 14, keep: 0, contract: 10 },
    { tomato: 20, keep: 5, contract: 10 },
    // Keeping 5 leaves 9, too few for the 10-tomato contract, so it isn't delivered.
    { tomato: 14, keep: 5, contract: 10 },
    { tomato: 12, keep: 0, contract: 0 },
  ];

  for (const { tomato, keep, contract } of cases) {
    freshState();
    if (contract) {
      acceptVillageContract({ crop: 'tomato', quantity: contract });
    }
    app.state.cropInventory.tomato = tomato;
    app.state.cropInventory.carrot = 6;
    app.setKeep('tomato', keep);

    const forecast = app.getUnitsForSale('village').tomato;
    const offered = app.createSale(app.getMarketLocationProfile()).sellers[0].assortment.tomato?.initialStock ?? 0;
    assert.equal(forecast, offered, `tomato ${tomato}, keep ${keep}, contract ${contract}`);
  }
});

test('the market panel and the report explain why fewer units are on sale than harvested', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshState();
  acceptVillageContract({ crop: 'tomato', quantity: 10 });
  app.state.cropInventory.tomato = 14;
  app.state.cropInventory.carrot = 6;
  app.state.marketOpen = true;
  app.render();

  assert.match(appElement.innerHTML, /Harvest: 14<\/span>\s*<span class="market-crop-count on-sale"[^>]*>On sale: 4</);
  assert.doesNotMatch(appElement.innerHTML, /On sale: 6/, 'carrot has nothing set aside');

  app.startSelling();
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), app.state.market.activeSimulation);
  assert.match(appElement.innerHTML, />On sale<\/span>/);
  assert.doesNotMatch(appElement.innerHTML, /Stocked/);
  assert.match(appElement.innerHTML, /🌾 14 harvested · 📜 10 to a contract/);
});
