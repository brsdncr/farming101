import test from 'node:test';
import assert from 'node:assert/strict';
import { app, appElement } from './helpers/appEnvironment.js';

function openShop(setup = () => {}) {
  globalThis.localStorage.clear();
  Object.assign(app.state, app.createInitialGameState());
  app.uiState.screen = 'game';
  app.uiState.shopCrop = null;
  setup();
  app.state.shopOpen = true;
  app.render();
  return appElement.innerHTML;
}

// The markup of the tile button for a data attribute, e.g. tileFor(html, 'data-shop-crop="pumpkin"').
function tileFor(html, attribute) {
  const tiles = html.split('<button').filter((part) => part.includes('class="shop-tile'));
  return tiles.find((part) => part.includes(attribute)) ?? '';
}

test('the shop is a full screen with crop tiles and a farm & markets group', () => {
  const html = openShop();

  assert.match(html, /class="shop-screen"/);
  assert.equal((html.match(/class="shop-tile /g) ?? []).length, 8 + 5, '8 crops + hold, barn, town, city, emergency');
  assert.match(html, /🌱 Crops/);
  assert.match(html, /Farm &amp; Markets/);
  assert.match(html, /📜 Contracts/);
});

test('unlocked crops are selected by clicking; locked crops unlock and show their price', () => {
  const html = openShop();

  assert.match(tileFor(html, 'data-shop-crop="tomato"'), /data-shop-action="select-crop"/);
  const pumpkin = tileFor(html, 'data-shop-crop="pumpkin"');
  assert.match(pumpkin, /data-shop-action="unlock-crop"/);
  assert.match(pumpkin, /Unlock · 250/);
  assert.match(pumpkin, /🔒/);
  assert.match(pumpkin, /unaffordable/, '20 starting coins can not pay 250');
});

test('the selected crop gets the buy and upgrade actions; tomato is selected by default', () => {
  let html = openShop();
  assert.match(tileFor(html, 'data-shop-crop="tomato"'), /selected/);
  assert.match(html, /data-shop-action="buy-seed" data-shop-crop="tomato"/);
  assert.match(html, /data-shop-action="upgrade-crop" data-shop-crop="tomato"/);

  html = openShop(() => { app.uiState.shopCrop = 'carrot'; });
  assert.match(html, /data-shop-action="buy-seed" data-shop-crop="carrot"/);
  assert.match(html, /Upgrade to Lv 2/);
});

test('a locked crop can not be the selected crop', () => {
  const html = openShop(() => { app.uiState.shopCrop = 'eggplant'; });

  assert.match(html, /data-shop-action="buy-seed" data-shop-crop="tomato"/);
});

test('the tile matching the next goal is highlighted', () => {
  const html = openShop();

  assert.match(tileFor(html, 'data-shop-crop="pumpkin"'), /goal/);
  assert.doesNotMatch(tileFor(html, 'data-shop-crop="beetroot"'), /class="shop-tile[^"]*goal/);
});

test('owned upgrades and open markets are shown as disabled tiles', () => {
  const html = openShop(() => {
    app.state.upgrades.hold = true;
    app.state.unlockedMarkets.town = true;
  });

  assert.match(html, /Hold slot<\/span>\s*<span class="shop-tile-meta">Owned/);
  assert.match(html, /Town<\/span>\s*<span class="shop-tile-meta">Open/);
  assert.match(html, /Emergency<\/span>\s*<span class="shop-tile-meta">Ready/);
  assert.match(tileFor(html, 'data-shop-market="city"'), /data-shop-action="unlock-market"/);
});

test('crop tiles are ordered by unlock price', () => {
  const html = openShop();
  const order = [...html.matchAll(/data-shop-crop="(\w+)"\s/g)].map((match) => match[1]);
  const tiles = [...new Set(order)];

  assert.deepEqual(tiles, ['tomato', 'carrot', 'pumpkin', 'beetroot', 'onion', 'cherry', 'eggplant', 'watermelon']);
});
