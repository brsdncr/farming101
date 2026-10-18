// The sale animation: a time-compressed market day in the spirit of Lemonade Tycoon. Customers walk
// in from both sides, stop at the stall, and show what they did in a speech bubble; people who wanted
// a crop the player didn't bring stroll past in the back. The sale result is fixed before the day
// starts, so the animation only replays it.
//
// Everything on screen is a pure function of the day's elapsed time, so the scene survives a full
// render() and speed changes need no bookkeeping.

const WALK_MS = 3600; // a stall visitor's time on screen
const ARRIVE_SHARE = 0.38; // share of it spent walking to the stall
const STALL_SHARE = 0.26; // share of it spent at the stall, with the speech bubble shown
const STROLL_MS = 5200; // a passer-by's time on screen
const CLOSING_MS = 1800; // the closing banner stays up this long before the report
// Only a sample of the customers is shown, so the street stays readable in big markets; the stall's
// counters still count every sale.
const VISITOR_GAP_MS = 550; // about one stall visitor per this much of the day
const SOLD_OUT_VISITORS_CAP = 12;
const PASSERS_BY_GAP_MS = 900;
const DAY_START_HOUR = 8;
const DAY_HOURS = 10;
const PRICEY_RATIO = 1.15; // above this share of the base price, a customer who passes calls it pricey

// People with a natural skin tone: the modifier goes right after the base emoji, before any
// joined part (👩 + 🏽 + ‍🦰 is a red-haired woman with a medium skin tone).
const PEOPLE = [['🧑'], ['👩'], ['👨'], ['👵'], ['🧒'], ['👱'], ['👴'], ['👧'], ['🧔'], ['👩', '\u200d🦰']];
const SKIN_TONES = ['🏻', '🏼', '🏽', '🏾', '🏿'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (from, to, share) => from + (to - from) * share;
const easeOut = (share) => 1 - (1 - share) ** 2;

// Evenly picks at most `cap` items, keeping their order.
function sampleEvenly(items, cap) {
  if (items.length <= cap) {
    return items;
  }
  return Array.from({ length: cap }, (_, index) => items[Math.floor((index * items.length) / cap)]);
}

// Builds the day's schedule from a finished simulation. Customers arrive in their simulated order,
// spread over the day; once every crop is sold out the market closes early.
export function buildSaleTimeline(simulation, { emojis, basePrices, msPerCustomer, minMs, maxMs }) {
  const needs = simulation.customerNeeds ?? [];
  const traffic = Math.max(1, needs.length);
  const offers = simulation.sellers[0]?.assortment ?? {};
  const events = simulation.events ?? [];
  const offerList = Object.values(offers);
  const soldOutEarly = offerList.length > 0 && offerList.every((offer) => offer.stock === 0);
  const closeIndex = soldOutEarly ? Math.max(...offerList.map((offer) => offer.soldOutAt ?? traffic)) : traffic;
  const closeShare = closeIndex / traffic;
  const activeMs = clamp(events.length * msPerCustomer, minMs, maxMs);
  const dayMs = activeMs / closeShare;
  const leadMs = WALK_MS * ARRIVE_SHARE;
  const arrivalAt = (customerIndex) => leadMs + ((customerIndex - 0.5) / traffic) * dayMs;
  const person = (customerIndex) => {
    const [base, joined = ''] = PEOPLE[(customerIndex * 7) % PEOPLE.length];
    // Varies independently of the person, so every look comes with every skin tone.
    const tone = SKIN_TONES[(customerIndex * 3 + Math.floor(customerIndex / 10)) % SKIN_TONES.length];
    return `${base}${tone}${joined}`;
  };
  const side = (customerIndex) => (customerIndex % 2 === 0 ? 'left' : 'right');

  const visitorCap = Math.max(1, Math.round(activeMs / VISITOR_GAP_MS));
  const walkers = sampleEvenly(events, visitorCap).map((event) => {
    const pricey = event.price > basePrices[event.crop] * PRICEY_RATIO;
    return {
      lane: 'front',
      at: arrivalAt(event.customerIndex),
      person: person(event.customerIndex),
      side: side(event.customerIndex),
      spot: ((event.customerIndex % 5) - 2) * 8,
      kind: event.sold ? 'bought' : 'passed',
      crop: event.crop,
      revenue: event.revenue,
      bubble: event.sold
        ? `${emojis[event.crop]} +${event.revenue}`
        : (pricey ? '💸 Too pricey!' : '🤔 Not today'),
    };
  });

  const served = new Set(events.map((event) => event.customerIndex));
  const soldOutVisitors = [];
  const passersBy = [];
  needs.slice(0, closeIndex).forEach((crop, index) => {
    const customerIndex = index + 1;
    if (served.has(customerIndex)) {
      return;
    }
    (offers[crop] ? soldOutVisitors : passersBy).push({ crop, customerIndex });
  });

  for (const { crop, customerIndex } of sampleEvenly(soldOutVisitors, SOLD_OUT_VISITORS_CAP)) {
    walkers.push({
      lane: 'front',
      at: arrivalAt(customerIndex),
      person: person(customerIndex),
      side: side(customerIndex),
      spot: ((customerIndex % 5) - 2) * 8,
      kind: 'soldout',
      crop,
      revenue: 0,
      bubble: `😢 No ${emojis[crop]} left`,
    });
  }

  // Passers-by wanted a crop the player didn't bring; every other one says which.
  sampleEvenly(passersBy, Math.round(activeMs / PASSERS_BY_GAP_MS)).forEach(({ crop, customerIndex }, index) => {
    walkers.push({
      lane: 'back',
      at: arrivalAt(customerIndex),
      person: person(customerIndex),
      side: side(customerIndex),
      spot: 0,
      kind: 'passerby',
      crop,
      revenue: 0,
      bubble: index % 2 === 0 ? `${emojis[crop]}?` : '',
    });
  });

  const closeAt = arrivalAt(closeIndex) + WALK_MS * STALL_SHARE;
  return {
    walkers,
    sales: events
      .filter((event) => event.sold)
      .map((event) => ({ at: arrivalAt(event.customerIndex), crop: event.crop, revenue: event.revenue })),
    leadMs,
    dayMs,
    closeShare,
    closeAt,
    durationMs: closeAt + CLOSING_MS,
    soldOutEarly,
    initialStock: Object.fromEntries(Object.entries(offers).map(([crop, offer]) => [crop, offer.initialStock])),
  };
}

export function formatDayClock(share) {
  const minutes = Math.round((DAY_START_HOUR * 60 + share * DAY_HOURS * 60) / 10) * 10;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// What the stall looks like `elapsed` ms into the day: the clock, coins taken and stock left.
export function getSaleDaySnapshot(timeline, elapsed) {
  const stock = { ...timeline.initialStock };
  let coins = 0;
  for (const sale of timeline.sales) {
    if (sale.at <= elapsed) {
      coins += sale.revenue;
      stock[sale.crop] -= 1;
    }
  }

  const share = clamp((elapsed - timeline.leadMs) / timeline.dayMs, 0, timeline.closeShare);
  return {
    clock: formatDayClock(share),
    coins,
    stock,
    closed: elapsed >= timeline.closeAt,
  };
}

// Stage coordinates are percentages of the stage: the stall stands in the middle, its visitors use
// the front of the street and passers-by the back.
function getWalkerPose(walker, elapsed) {
  const fromLeft = walker.side === 'left';
  const startX = fromLeft ? -8 : 108;
  const endX = fromLeft ? 108 : -8;

  if (walker.lane === 'back') {
    const share = (elapsed - (walker.at - STROLL_MS / 2)) / STROLL_MS;
    if (share < 0 || share > 1) {
      return null;
    }
    return { x: lerp(startX, endX, share), y: 40, walking: true, bubble: Boolean(walker.bubble), share };
  }

  const share = (elapsed - (walker.at - WALK_MS * ARRIVE_SHARE)) / WALK_MS;
  if (share < 0 || share > 1) {
    return null;
  }

  const spotX = 50 + walker.spot;
  const spotY = 70;
  if (share < ARRIVE_SHARE) {
    const step = easeOut(share / ARRIVE_SHARE);
    return { x: lerp(startX, spotX, step), y: lerp(88, spotY, step), walking: true, bubble: false, share };
  }
  if (share < ARRIVE_SHARE + STALL_SHARE) {
    return { x: spotX, y: spotY, walking: false, bubble: true, share };
  }
  const step = (share - ARRIVE_SHARE - STALL_SHARE) / (1 - ARRIVE_SHARE - STALL_SHARE);
  return { x: lerp(spotX, endX, step), y: lerp(spotY, 88, step), walking: true, bubble: false, share };
}

function createWalkerElement(walker) {
  const element = document.createElement('div');
  element.className = `walker walker-${walker.lane} walker-${walker.kind}`;
  element.innerHTML = `<span class="walker-bubble">${walker.bubble}</span><span class="walker-body">${walker.person}</span>`;
  return element;
}

// Brings the stage up to date for `elapsed` ms into the day. `elements` caches walker elements
// between frames; a re-rendered stage simply gets fresh ones.
export function updateSaleStage(stage, timeline, elapsed, elements) {
  const crowd = stage.querySelector('.sale-crowd');
  if (!crowd) {
    return;
  }

  const visible = new Set();
  timeline.walkers.forEach((walker, index) => {
    const pose = getWalkerPose(walker, elapsed);
    if (!pose) {
      return;
    }

    visible.add(index);
    let element = elements.get(index);
    if (!element || element.parentNode !== crowd) {
      element = createWalkerElement(walker);
      crowd.appendChild(element);
      elements.set(index, element);
    }

    const bob = pose.walking ? Math.abs(Math.sin(pose.share * Math.PI * 9)) * 5 : 0;
    element.style.left = `${pose.x}%`;
    element.style.top = `${pose.y}%`;
    element.style.zIndex = String(Math.round(pose.y));
    element.style.setProperty('--bob', `${-bob}px`);
    element.classList.toggle('talking', pose.bubble);
  });

  for (const [index, element] of elements) {
    if (!visible.has(index)) {
      element.remove();
      elements.delete(index);
    }
  }

  const snapshot = getSaleDaySnapshot(timeline, elapsed);
  const clock = stage.querySelector('[data-sale-clock]');
  if (clock) {
    clock.textContent = snapshot.clock;
  }
  const coins = stage.querySelector('[data-sale-coins]');
  if (coins) {
    coins.textContent = snapshot.coins.toLocaleString('en-US');
  }
  for (const [crop, left] of Object.entries(snapshot.stock)) {
    const chip = stage.querySelector(`[data-stock-crop="${crop}"]`);
    if (chip) {
      chip.querySelector('b').textContent = String(left);
      chip.classList.toggle('sold-out', left === 0);
    }
  }
  const banner = stage.querySelector('.sale-closed-banner');
  if (banner) {
    banner.hidden = !snapshot.closed;
  }
}
