import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from './helpers/appEnvironment.js';

test('market customer simulation creates one event per customer and summary totals', () => {
  const profile = { label: 'Village', trafficMin: 50, trafficMax: 50, competitors: 1 };
  assert.equal(typeof app.buildMarketCustomerSimulation, 'function');

  const simulation = app.buildMarketCustomerSimulation(profile, ['tomato', 'carrot']);

  assert.equal(simulation.totalCustomers, simulation.events.length);
  assert.equal(simulation.totalCustomers, 100);
  assert.ok(simulation.events.every((event) => Number.isInteger(event.customerIndex)));
  assert.ok(simulation.events.every((event) => typeof event.emoji === 'string' && event.emoji.length > 0));
});

test('market simulation aggregates sold crops and their prices for every seller', () => {
  Object.assign(app.state, app.createInitialGameState());
  app.state.cropInventory.tomato = 20;
  app.state.market.selectedQuantities.tomato = 20;

  const originalRandom = Math.random;
  Math.random = () => 0;
  let simulation;

  try {
    simulation = app.buildMarketCustomerSimulation(
      { trafficMin: 50, trafficMax: 50, competitors: 1 },
      ['tomato'],
    );
  } finally {
    Math.random = originalRandom;
  }

  assert.deepEqual(simulation.sellers[0].cropSales.tomato, {
    quantity: 20,
    price: 8,
    revenue: 160,
  });
  assert.deepEqual(simulation.sellers[1].cropSales.tomato, {
    quantity: 50,
    price: 8,
    revenue: 400,
  });
});
