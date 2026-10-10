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
