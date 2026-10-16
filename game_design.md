# Game Design Document (GDD)

## 1. Overview & Vision

A pixel-art tile-placement and farming economy strategy game. Players plant crop-filled tetrominoes on a small farm grid, grow connected groups of the same crop that harvest automatically, and sell the harvest in markets of increasing size. Profits buy new crops, seed upgrades and access to bigger markets.

* **Goal:** Become a millionaire (1,000,000 coins) as young as possible. The player starts at age 20 and dies at age 85.

* **Visual Style:** 100% Pixel Art (all sprites, icons, tiles, UI components, and typography must adhere to pixel art aesthetics).

* **Language:** English.

## 2. Core Game Loop

1. **Plant:** Place the current tetromino on the 6×6 field. The next tetromino is shown as a preview and can be swapped in.

2. **Auto-Harvest:** Any connected group of 5 or more same-crop tiles is harvested immediately, freeing its tiles. An **Emergency** button can harvest the whole field once.

3. **Market:** Whenever ready, take the harvested crops to an unlocked market, set prices, and run the sales simulation. All harvested crops go to market; unsold crops spoil.

4. **Shop:** After each market visit, buy seeds, unlock crops and markets, upgrade seed levels, and restock the Emergency harvest.

5. **Time:** Each market visit advances the calendar. The game ends on becoming a millionaire, dying at 85, or going bankrupt.

## 3. Grid & Tetromino Placement System

### 3.1 Grid Mechanics

* **Grid Size:** $6 \times 6$ tiles.

* **Rules & Validation:**

  * Each tile can hold 1 crop or remain empty soil.

  * Placement **fails** if any tile under the shape is already occupied or falls outside the $6 \times 6$ boundaries. A failed placement returns the tetromino to the hand.

* **Connected Groups:** Crops connect orthogonally (up, down, left, right) with neighbours of the same type.

### 3.2 Hand: Current & Next

* The hand holds two tetrominoes: **Current** and **Next**.

* Only the **Current** tetromino can be dragged onto the field or rotated.

* The **Swap** button (🔁, between the two cards) exchanges Current and Next. Swapping is free and unlimited.

* After the Current tetromino is placed, Next becomes Current and a new Next is drawn.

* Hand cards show only the tetromino's blocks, centered; the shape letter is not shown.

### 3.3 Tetromino Definitions & Controls

Standard 4-block polyominoes (7 types):

* **Shapes:** `I`, `L`, `J` (Reverse L), `S`, `Z`, `T`, `O`.

* **Bag Generation Algorithm:** Shapes are drawn from a 14-piece bag cycle where each of the 7 tetromino types appears exactly twice per 14 draws ($2 \times I, 2 \times L, 2 \times J, 2 \times S, 2 \times Z, 2 \times T, 2 \times O$).

* **Controls:**

  * **Placement:** Drag-and-drop.

  * **Rotation:** Mouse wheel scroll or touchpad up/down gesture over the Current card (or while dragging).

### 3.4 Seed Stock & Tetromino Filling

* **Initial Seed Stock:** $20 \times \text{Tomato}$, $20 \times \text{Carrot}$.

* **Weighted Filling:** Each block is filled with a crop chosen at random, weighted by the player's remaining seed counts.

  * *Example:* With 17 Tomato and 19 Carrot seeds, the next block is a Carrot with probability $\frac{19}{36}$.

  * The player cannot choose which seeds go into a tetromino: all seed types in stock are mixed in.

* **Reservation:** Seeds shown in the Current and Next tetrominoes are set aside, so the hand never shows more seeds than the player owns.

* **Consumption:** Seeds are subtracted from stock only when a tetromino is placed.

* **Low Stock:** If fewer than 4 seeds remain, the full 4-block shape is still drawn; unfilled blocks are empty and leave the field tile empty when placed. With no seeds at all, no tetromino is drawn.

## 4. Crops

### 4.1 Crop Economy

Tomato and Carrot are the cheap starter crops and are unlocked from the start. All other crops are unlocked with coins in the Shop; they cost much more to unlock and to seed, but sell for far more.

| Crop | Base Price | Unlock Cost | Seed Pack (10 seeds) |
| ----- | ----- | ----- | ----- |
| **Tomato** | 8 | Free | 10 |
| **Carrot** | 6 | Free | 10 |
| **Pumpkin** | 14 | 250 | 30 |
| **Beetroot** | 16 | 400 | 40 |
| **Onion** | 35 | 1,500 | 100 |
| **Cherry** | 60 | 3,000 | 150 |
| **Eggplant** | 120 | 10,000 | 300 |
| **Watermelon** | 200 | 20,000 | 500 |

* A crop being **defined** in the game is distinct from it being **unlocked** for the player. Locked crops cannot be bought as seeds.

### 4.2 Seed Levels & Upgrades

* Unlocked crops start at level 1; the maximum level is 10.

* **Yield Bonus:** Each harvested group of a crop yields $(\text{level} - 1)$ extra units, once per group (not per tile).

* **Upgrade Cost:** Reaching level $L$ costs $\text{Seed Pack Cost} \times 2 \times 2^{L-2}$. Each level costs double the previous one.

  * *Examples:* Tomato level 2 costs 20 and level 10 costs 5,120. Watermelon level 2 costs 1,000 and level 10 costs 256,000.

### 4.3 Seasonal Crops

The calendar alternates between summer and winter (see §7). The crops are grouped by season for future seasonal mechanics; seasons currently have no gameplay effect.

* **Winter Crops:** Pumpkin, Carrot, Onion, Beetroot.

* **Summer Crops:** Cherry, Watermelon, Tomato, Eggplant.

## 5. Harvest System

### 5.1 Auto-Harvest

* Harvesting is free and automatic.

* After every placement, each connected group of **5 or more** tiles of the same crop is harvested and its tiles are cleared back to empty soil.

* A single tetromino (4 tiles) can never trigger a harvest alone; it must connect to at least one more same-crop tile.

* Harvested units go into the harvest stock for the next market visit:

  * $\text{Units} = \text{Group Size} + (\text{Seed Level} - 1)$

* The board header shows what was just harvested, e.g. "Auto-harvested: 🍅 5".

### 5.2 Emergency Harvest

A one-shot joker for a field clogged with groups too small to auto-harvest.

* A big red **🚨 Emergency** button is fixed to the bottom-right of the screen. It shrinks on narrower screens (smaller pill, then icon only) to stay clear of the game area.

* Clicking it harvests **every crop on the field**, without the seed level bonus.

* The player starts with 1 charge and can hold at most 1. Once used, the button shows "Used" until restocked.

* It is disabled while the field is empty.

* **Restock:** 50 coins in the Shop.

### 5.3 End of Season

* Whatever is still planted when a market visit ends (sale finished or season skipped) is discarded. Each season starts with an empty field.

## 6. Marketplace & Sales Simulation

### 6.1 Markets

Opened via the **Marketplace** button. There are no entry fees and no AI rivals; the player is the only seller.

| Location | Unlock Cost | Customer Traffic | Minimum Variety | Crops Bought |
| ----- | ----- | ----- | ----- | ----- |
| **Village** | Free | $50 - 100$ | 2 crop types | Tomato, Carrot, Pumpkin, Beetroot |
| **Town** | 2,000 | $250 - 750$ | 3 crop types | Village crops + Onion, Cherry |
| **City** | 25,000 | $1000 - 5000$ | 4 crop types | All crops |

* **Unlocking:** Town and City are unlocked with coins in the Shop. Locked markets are shown in the location list but cannot be selected.

* **Minimum Variety:** A trip must bring at least the listed number of crop types the market buys, each with at least **3 harvested units**. This prevents relying on a single crop.

* **Demand Weights:** Each customer wants one crop, drawn by the market's demand weights:

| Crop | Village | Town | City |
| ----- | ----- | ----- | ----- |
| Tomato | 5 | 4 | 3 |
| Carrot | 4 | 3 | 3 |
| Pumpkin | 1 | 2 | 2 |
| Beetroot | 1 | 2 | 2 |
| Onion | – | 1 | 2 |
| Cherry | – | 1 | 2 |
| Watermelon | – | – | 1 |
| Eggplant | – | – | 1 |

### 6.2 Marketplace UI

* **Location:** Select an unlocked market.

* **Harvested Crops:** Every harvested crop is listed with its quantity. All of it goes to market; there is no quantity selection.

  * Crops the selected market does not buy are marked as spoiling.

* **Price:** Adjust each crop's unit price with − / +. The panel shows the expected share of buyers at that price (e.g. "Price: 9 · ~59% of buyers").

* **Status:** The panel shows variety progress (e.g. "Variety: 2/2 crop types with 3+ units"), customer traffic, and why selling is blocked, if it is.

* **Skip Season:** Offered only when no unlocked market accepts the harvest. It discards the harvest and the field and advances time (see §7.2).

### 6.3 Sales Simulation Logic

* Clicking **Start Selling** runs the simulation and plays it as an animation (skippable after 3 seconds).

* **Traffic:** A random number of customers within the market's traffic range visits.

* **Demand Curve:** A customer who wants a crop the player brought, while it is still in stock, buys one unit with probability:

  * $r = \frac{\text{Price}}{\text{Base Price}}$, $\quad P(\text{buy}) = \dfrac{1}{1 + \frac{3}{7} e^{4(r - 1)}}$

  * 70% of customers buy at the base price; fewer buy as the price rises and more as it falls.

| Price vs Base | 0.5× | 0.75× | **1×** | 1.25× | 1.5× | 2× |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| **Buyers** | 94% | 86% | **70%** | 46% | 24% | 4% |

* **Pricing Strategy:** When demand exceeds stock, raising the price earns more while still selling out. When stock exceeds demand, lowering the price sells more.

* **Spoil/Waste Penalty:** Unsold crops, and crops the market does not buy, spoil at the end of the visit. Harvested crops never turn back into seeds; only unplanted seeds carry over.

### 6.4 Sale Report

After the sale, a summary shows revenue per crop and a funnel for the player's stall:

* **Wanted:** Customers who wanted a crop the player brought.

* **Served:** Of those, customers who arrived while that crop was still in stock.

* **Sold:** Of those, customers who accepted the price and bought.

* Gaps in the funnel point to the fix: Wanted ≫ Served means the crop sold out (raise prices or grow more); Served ≫ Sold means the price was too high.

## 7. Time, Goal & Game Endings

### 7.1 Calendar & Age

* Each finished market visit (or skipped season) advances time by one visit.

* **2 visits per season**, alternating summer and winter; **4 visits per year**.

* The player starts at **age 20** and ages one year every 4 visits; age 85 is reached after 260 visits.

* The HUD shows Round, Season, Age, and Coins / Goal.

### 7.2 Endings

Game endings are evaluated on the main screen, after the sale summary has been closed.

* 🏆 **Millionaire (Win):** Reach 1,000,000 coins. The score is the age at which it happened.

* 🪦 **Game Over:** Reach age 85 without becoming a millionaire.

* 💸 **Bankrupt:** No seeds, no harvested crops, an empty field, and fewer coins than the cheapest unlocked seed pack.

* Running low on coins alone does not end the game.

## 8. Shop

Opens after each market visit (or skipped season).

* **Emergency Harvest:** Restock the single charge (50 coins).

* **Markets:** Unlock Town (2,000) and City (25,000).

* **Crops:** Unlock locked crops, buy seed packs of unlocked crops (10 seeds per pack), and upgrade seed levels.

* Closing the Shop draws a fresh hand from the current seed stock.

## 9. Balance

The economy is tuned with a headless simulation that plays whole careers with the real game code: hand and swap, placement, auto-harvest, Emergency, market, shop and calendar.

* **Run:** `npm run balance -- [tilesPerVisit] [runs]` (defaults: 100 tiles, 10 careers).

* **Bot Player:** Picks the placement and rotation that best grows or completes groups, swaps when Next is better, prices each crop to maximise expected revenue, unlocks crops and markets while keeping a seed reserve, upgrades only when supply falls short of demand, and restocks the Emergency harvest.

* **Effort** (crop tiles planted per visit) is the key input: with auto-harvest, the field size does not cap output.

* **Current Results:**

| Tiles per Visit | 40 | 60 | 100 | 160 |
| ----- | ----- | ----- | ----- | ----- |
| **Reached 1,000,000** | 27/30 | 27/30 | 99/100 | 30/30 |
| **Median Age at 1,000,000** | 82 | 64 | 55 | 52 |

* Town is typically unlocked around age 24 and City around age 30–33.

* Returns diminish above roughly 110 tiles per visit, because the field clogs faster than groups clear.

* An engaged run is about 140 visits of around 25 placements each.

## 10. Planned & Open Items

### 10.1 Random Events (Not Implemented)

Planned to occur automatically on a regular cycle. Examples:

* **Shortage:** Specific crop price multiplier skyrockets.

* **Bumper Crop / Glut:** Demand drops for specific items.

* **Fad / Trend:** High demand for specific seasonal items in specific locations.

### 10.2 Open Design Questions

* **Emergency harvest is nearly free late in the game.** The simulation uses it on almost every visit because 50 coins is negligible once income is in the thousands. Options: scale its price with income, raise it, or add a cooldown.

* **City's 4-type variety minimum is hard for light players.** Because tetrominoes mix all seed types at random, minor crops rarely form groups of 5. Options: let the player choose which seeds go into tetrominoes, lower City's minimum to 3, or relax how variety is counted.

* **Game length.** If a shorter game is wanted, make each visit richer rather than reducing the number of visits.

## 11. Technical & Architectural Guidelines

* **Code Layout:**

  * `app.js` — game state, rules, rendering and input handling (the entry module loaded by `index.html`).

  * `src/config/crops.js` — crops, crop economy, seed config and upgrade costs, markets, demand curve, harvest and Emergency constants.

  * `src/config/game.js` — calendar, ages and the coin goal.

  * `src/config/shapes.js` — tetromino shapes.

  * `src/state/gridState.js` — grid creation, placement validation and connected-group detection.

  * `src/state/inventoryState.js` — seed and harvest stock helpers.

  * `scripts/balance.mjs` — the balance simulation.

  * `src/main.js`, `src/state/gameState.js`, `src/state/handState.js` and `src/state/marketState.js` are older, unused prototypes that do not reflect the current rules.

* **State Management:** A single mutable `state` object in `app.js`; rule functions update it and call `render()`.

* **Tests:** `npm test` runs the Node test suite in `tests/`.

* **Pixel Art Standard:**

  * Uniform pixel scale/aspect ratio.

  * Custom retro font or pixel-perfect text rendering.

  * No high-resolution vector assets or smooth gradients.

  * *Current status:* The UI still uses emoji crop icons and CSS gradients (including the Emergency button). A pixel-art pass is still needed.
