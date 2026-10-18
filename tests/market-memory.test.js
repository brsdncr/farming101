import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';
import { CROP_BASE_PRICES } from '../src/config/crops.js';
import { restoreGame, serializeGame } from '../src/state/saveState.js';

function freshState() {
  Object.assign(app.state, app.createInitialGameState());
  app.state.unlockedMarkets.town = true;
  app.state.unlockedMarkets.city = true;
}

// Settles a sale that sold `cropSales` ({ crop: units }) at `locationKey`.
function settleSale(locationKey, cropSales) {
  const sales = Object.fromEntries(Object.entries(cropSales).map(([crop, quantity]) => [crop, { quantity, revenue: 0 }]));
  const simulation = {
    sellers: [{ revenue: 0, cropSales: sales, assortment: {} }],
    totalCustomers: 0,
    totalRequested: 0,
    totalSold: 0,
    totalRevenue: 0,
    contracts: [],
    kept: {},
    locationKey,
  };
  app.state.market.location = locationKey;
  app.state.market.simulating = true;
  app.state.market.activeSimulation = simulation;
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), simulation);
}

// Town tomato demand is 4/13 of 400 customers on average.
const TOWN_TOMATO_DEMAND = 400 * (4 / 13);

test('a sale floods the market by units sold ÷ normal demand × 1.5, halved when the visit ends', () => {
  freshState();
  const added = (20 / TOWN_TOMATO_DEMAND) * 1.5;

  settleSale('town', { tomato: 20 });
  assert.ok(Math.abs(app.state.market.flood.town.tomato - added / 2) < 1e-9);

  settleSale('town', { tomato: 20 });
  assert.ok(Math.abs(app.state.market.flood.town.tomato - (added / 2 + added) / 2) < 1e-9, 'repeating builds up');
});

test('the Village never floods', () => {
  freshState();
  settleSale('village', { tomato: 40, carrot: 30 });
  assert.deepEqual(app.state.market.flood.village ?? {}, {});
});

test('every market recovers after any visit, including a skipped season', () => {
  freshState();
  app.state.market.flood = { city: { watermelon: 0.4, onion: 0.015 } };

  settleSale('town', { tomato: 5 });
  assert.ok(Math.abs(app.state.market.flood.city.watermelon - 0.2) < 1e-9);
  assert.equal('onion' in app.state.market.flood.city, false, 'tiny floods are dropped');

  app.skipSeason();
  assert.ok(Math.abs(app.state.market.flood.city.watermelon - 0.1) < 1e-9);
});

test('flooding is capped', () => {
  freshState();
  settleSale('town', { cherry: 500 });
  assert.ok(Math.abs(app.state.market.flood.town.cherry - 0.3) < 1e-9, 'capped at 0.6, then halved');
});

test('customers judge a flooded crop by a lower price', () => {
  freshState();
  app.state.market.location = 'city';
  const fresh = app.getDemandForecast('city', 'watermelon', 280).buyChance;
  app.state.market.flood = { city: { watermelon: 0.3 } };

  assert.ok(Math.abs(app.getReferencePrice('city', 'watermelon') - 196) < 1e-9);
  assert.ok(app.getDemandForecast('city', 'watermelon', 280).buyChance < fresh);
  assert.ok(Math.abs(app.getDemandForecast('city', 'watermelon', 196).buyChance - fresh) < 1e-9);

  app.state.cropInventory.watermelon = 10;
  const simulation = app.buildMarketCustomerSimulation(app.getMarketLocationProfile(), ['watermelon']);
  assert.ok(Math.abs(simulation.sellers[0].assortment.watermelon.referencePrice - 196) < 1e-9);
  assert.equal(CROP_BASE_PRICES.watermelon, 280, 'the base price itself is unchanged');
});

test('the market panel and the sale report say when a crop is flooded', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshState();
  app.state.market.location = 'town';
  app.state.market.flood = { town: { tomato: 0.3 } };
  app.state.cropInventory.tomato = 10;
  app.state.cropInventory.carrot = 10;
  app.state.cropInventory.pumpkin = 10;
  app.state.marketOpen = true;
  app.render();
  assert.match(appElement.innerHTML, /🥱 Town has had plenty of tomato lately: customers pay ~30% less/);
  assert.doesNotMatch(appElement.innerHTML, /plenty of carrot/);

  app.startSelling();
  app.state.market.skipAnimation = true;
  app.finalizeMarketSimulation(app.getMarketLocationProfile(), app.state.market.activeSimulation);
  assert.match(appElement.innerHTML, /🥱 Town was flooded with tomato: customers paid ~30% less/);
});

test('market memory is saved; older saves start without it', () => {
  freshState();
  app.state.market.flood = { city: { eggplant: 0.25 } };
  const save = serializeGame(app.state);

  assert.deepEqual(restoreGame(save, app.createInitialGameState()).market.flood, { city: { eggplant: 0.25 } });

  delete save.state.market.flood;
  assert.deepEqual(restoreGame(save, app.createInitialGameState()).market.flood, {});
});
