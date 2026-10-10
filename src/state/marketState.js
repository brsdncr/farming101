import { CROP_BASE_PRICES, MARKET_LOCATIONS } from '../config/crops.js';

export function createMarketState(overrides = {}) {
  const currentLocation = overrides.location ?? 'village';
  const profile = MARKET_LOCATIONS[currentLocation];

  return {
    location: currentLocation,
    entryFee: profile.entryFee,
    trafficMin: profile.trafficMin,
    trafficMax: profile.trafficMax,
    competitors: profile.competitors,
    prices: { ...CROP_BASE_PRICES },
    selectedQuantity: 1,
    pendingSale: [],
    ...overrides,
  };
}

export function setMarketLocation(state, locationKey) {
  const profile = MARKET_LOCATIONS[locationKey];

  if (!profile) {
    return state;
  }

  state.location = locationKey;
  state.entryFee = profile.entryFee;
  state.trafficMin = profile.trafficMin;
  state.trafficMax = profile.trafficMax;
  state.competitors = profile.competitors;

  return state;
}
