import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';
import {
  CROP_BASE_PRICES,
  CROP_EMOJIS,
  SALE_DAY_MAX_MS,
  SALE_DAY_MIN_MS,
  SALE_DAY_MS_PER_CUSTOMER,
} from '../src/config/crops.js';
import { buildSaleTimeline, formatDayClock, getSaleDaySnapshot } from '../src/ui/saleDay.js';

// Small deterministic PRNG (mulberry32) so simulations are reproducible.
function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIMELINE_OPTIONS = {
  emojis: CROP_EMOJIS,
  basePrices: CROP_BASE_PRICES,
  msPerCustomer: SALE_DAY_MS_PER_CUSTOMER,
  minMs: SALE_DAY_MIN_MS,
  maxMs: SALE_DAY_MAX_MS,
};

function freshState() {
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.saleSpeed = 1;
}

function simulate(location, stock, seed = 1) {
  app.state.market.location = location;
  Object.assign(app.state.cropInventory, stock);
  return app.buildMarketCustomerSimulation(app.getMarketLocationProfile(), Object.keys(stock), { random: seededRandom(seed) });
}

test('price buttons step by 10% of the base price, at least 1 coin', () => {
  freshState();
  app.state.market.prices.watermelon = 280;

  app.adjustMarketPrice(1, 'watermelon');
  assert.equal(app.state.market.prices.watermelon, 308);

  app.adjustMarketPrice(1, 'tomato');
  assert.equal(app.state.market.prices.tomato, 12);

  app.state.market.prices.carrot = 1;
  app.adjustMarketPrice(-1, 'carrot');
  assert.equal(app.state.market.prices.carrot, 1, 'never below 1 coin');
});

test('the forecast covers the market traffic range and the share who buy at the price', () => {
  freshState();
  // Village tomato demand is 5/11 of 50–100 customers.
  const forecast = app.getDemandForecast('village', 'tomato', CROP_BASE_PRICES.tomato);

  assert.deepEqual(forecast.wanted, { min: 23, max: 45 });
  assert.ok(Math.abs(forecast.buyChance - 0.7) < 1e-9);
});

test('the market panel shows the price change and the forecast', () => {
  freshState();
  app.state.cropInventory.tomato = 20;
  app.state.marketOpen = true;
  app.render();
  assert.match(appElement.innerHTML, /base price/);
  assert.match(appElement.innerHTML, /📊 23–45 customers want tomato · ~70% buy at this price/);
  assert.doesNotMatch(appElement.innerHTML, /sells out|sells \d/, 'how many units sell is left to the player');

  app.adjustMarketPrice(1, 'tomato');
  assert.match(appElement.innerHTML, /\+9%/);
});

test('a sample of the customers walks up to the stall; the day ends with the full sale result', () => {
  freshState();
  const simulation = simulate('village', { tomato: 30, carrot: 30 }, 3);
  const timeline = buildSaleTimeline(simulation, TIMELINE_OPTIONS);
  const [seller] = simulation.sellers;

  const visitors = timeline.walkers.filter((walker) => walker.kind === 'bought' || walker.kind === 'passed');
  assert.ok(visitors.length > 0 && visitors.length < simulation.events.length);
  assert.equal(timeline.sales.length, seller.sold, 'the counters count every sale');

  const end = getSaleDaySnapshot(timeline, timeline.durationMs);
  assert.equal(end.coins, seller.revenue);
  assert.deepEqual(end.stock, { tomato: seller.assortment.tomato.stock, carrot: seller.assortment.carrot.stock });
  assert.equal(end.closed, true);

  const start = getSaleDaySnapshot(timeline, 0);
  assert.equal(start.coins, 0);
  assert.equal(start.clock, '08:00');
});

test('the market closes early once everything is sold out', () => {
  freshState();
  const simulation = simulate('village', { tomato: 3, carrot: 3 }, 5);
  const timeline = buildSaleTimeline(simulation, TIMELINE_OPTIONS);

  assert.equal(timeline.soldOutEarly, true);
  assert.ok(timeline.closeShare < 1);
  assert.ok(timeline.walkers.every((walker) => walker.at <= timeline.closeAt));
  assert.notEqual(getSaleDaySnapshot(timeline, timeline.durationMs).clock, formatDayClock(1));
});

test('a City day stays short and its crowd is capped', () => {
  freshState();
  app.state.unlockedMarkets.city = true;
  const simulation = simulate('city', { tomato: 60, carrot: 60, pumpkin: 60, onion: 60 }, 9);
  const timeline = buildSaleTimeline(simulation, TIMELINE_OPTIONS);

  assert.ok(timeline.durationMs < 25000, `day lasts ${timeline.durationMs} ms`);
  assert.ok(timeline.walkers.filter((walker) => walker.kind === 'bought' || walker.kind === 'passed').length <= 40);
  assert.ok(timeline.walkers.filter((walker) => walker.kind === 'passerby').length <= 25);
  assert.ok(timeline.walkers.filter((walker) => walker.kind === 'soldout').length <= 12);
});

// Mocked timers jump straight to the end of a tick, so advance frame by frame like a browser.
function playFrames(t, ms) {
  for (let passed = 0; passed < ms; passed += 16) {
    t.mock.timers.tick(16);
  }
}

test('the day settles the sale on its own, sooner at a higher speed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  freshState();
  app.state.cropInventory.tomato = 10;
  app.state.cropInventory.carrot = 10;

  app.startSelling();
  const simulation = app.state.market.activeSimulation;
  const { durationMs } = buildSaleTimeline(simulation, TIMELINE_OPTIONS);
  app.cycleSaleSpeed();
  app.cycleSaleSpeed();
  assert.equal(app.uiState.saleSpeed, 4);

  playFrames(t, durationMs / 4 - 200);
  assert.equal(app.state.market.simulating, true, 'still selling just before the sped-up end');

  playFrames(t, 400);
  assert.equal(app.state.market.saleComplete, true);
  assert.equal(app.state.coins, 20 + simulation.sellers[0].revenue);
  assert.match(appElement.innerHTML, /sale-tip/);

  app.cycleSaleSpeed();
  assert.equal(app.uiState.saleSpeed, 1);
});

test('sale tips tell the player which way to move the price', () => {
  const offer = (fields) => ({ price: 12, initialStock: 30, ...fields });

  const early = app.getCropSaleTip('tomato', offer({ stock: 0, wanted: 54, served: 18 }));
  assert.equal(early.kind, 'up');
  assert.match(early.text, /18 of 54/);

  assert.equal(app.getCropSaleTip('tomato', offer({ stock: 0, wanted: 54, served: 50 })).kind, 'ok');
  assert.equal(app.getCropSaleTip('tomato', offer({ stock: 20, wanted: 40, served: 40 })).kind, 'down', '10 of 40 bought');

  const almost = app.getCropSaleTip('tomato', offer({ stock: 6, wanted: 40, served: 40 }));
  assert.equal(almost.kind, 'down');
  assert.match(almost.text, /6 left/);

  assert.equal(app.getCropSaleTip('tomato', offer({ stock: 10, wanted: 22, served: 22 })).kind, 'less');
  assert.equal(app.getCropSaleTip('tomato', offer({ stock: 30, wanted: 0, served: 0 })).kind, 'less');
});
