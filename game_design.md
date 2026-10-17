# Game Design Document (GDD)

## 1. Overview & Vision

A cozy, cartoon-style tile-placement and farming economy strategy game. Players plant crop-filled tetrominoes on a small farm grid, grow connected groups of the same crop that harvest automatically, and sell the harvest in markets of increasing size. Profits buy new crops, seed upgrades and access to bigger markets.

* **Goal:** Become a millionaire (1,000,000 coins) as young as possible. The player starts at age 20 and dies at age 85.

* **Visual Style:** Cozy cartoon farm (see §12): a sunny farm scene, a wooden board with cream cells, chunky cream buttons with brown outlines, and bold rounded lettering with a dark outline.

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

* **Hold Slot (upgrade, 1,500 coins in the Shop):** Adds a third card, **Hold**, after Next.

  * With an empty hold, the **📥** button (Hold current) in the card's corner parks the Current block there; Next becomes Current and a new Next is drawn.

  * With a block held, the **⇄** button (Swap with current) trades the Current and held blocks. The held block can't be placed directly; swap it back first.

  * Seeds shown in the held block are reserved like the other cards. The hold empties when a new season starts (its seeds stay in stock).

### 3.3 Tetromino Definitions & Controls

Standard 4-block polyominoes (7 types):

* **Shapes:** `I`, `L`, `J` (Reverse L), `S`, `Z`, `T`, `O`.

* **Bag Generation Algorithm:** Shapes are drawn from a 14-piece bag cycle where each of the 7 tetromino types appears exactly twice per 14 draws ($2 \times I, 2 \times L, 2 \times J, 2 \times S, 2 \times Z, 2 \times T, 2 \times O$).

* **Controls:**

  * **Placement:** Drag-and-drop.

  * **Rotation:** Mouse wheel scroll or touchpad up/down gesture over the Current card (or while dragging). Over the hand or field, the wheel never scrolls the page.

* **Layout:** The farm screen (top bar, field, hand and sidebar) always fits the window without scrolling (from 1280×720 up); the field grows with the window height, and hand blocks are about 75% of a field tile.

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
| **Tomato** | 11 | Free | 10 |
| **Carrot** | 8 | Free | 10 |
| **Pumpkin** | 20 | 250 | 30 |
| **Beetroot** | 22 | 400 | 40 |
| **Onion** | 49 | 1,500 | 100 |
| **Cherry** | 84 | 3,000 | 150 |
| **Eggplant** | 168 | 10,000 | 300 |
| **Watermelon** | 280 | 20,000 | 500 |

* A crop being **defined** in the game is distinct from it being **unlocked** for the player. Locked crops cannot be bought as seeds.

### 4.2 Seed Levels & Upgrades

* Unlocked crops start at level 1; the maximum level is 10.

* **Yield Bonus:** Each level above 1 adds **+15%** yield to that crop's auto-harvests ($\times 1.15$ at level 2 … $\times 2.35$ at level 10). The Shop shows the multiplier the next upgrade gives.

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

* Harvested units go into the harvest stock for the next market visit, rounded per group:

  * $\text{Units} = \text{Group Size} \times \text{Size Bonus} \times \text{Level Bonus} \times \text{Combo Bonus}$

* **Size Bonus:** Bigger groups pay more per tile, so building past 5 is rewarded.

| Group Size | 5–7 | 8–11 (**Big**) | 12+ (**Huge**) |
| ----- | ----- | ----- | ----- |
| **Size Bonus** | ×1 | ×1.5 | ×2 |

  * Because auto-harvest triggers as soon as a group reaches 5, Big and Huge groups come from joining tiles into 8+ in a single placement (e.g. dropping a 4-block next to a group of 4).

* **Level Bonus:** $1 + 0.15 \times (\text{Seed Level} - 1)$ (see §4.2).

* **Combo:** Every group harvested in a row adds +10% to the next one, up to ×2. Several groups harvested by one placement each extend the combo. A placement that harvests nothing, an Emergency harvest, or a new season resets it.

  * *Example:* One group of 10 at level 1 yields 15. Two groups of 5 yield 5 + 6 (the second at Combo ×1.1).

* **Feedback:** The board header shows what was just harvested, e.g. "Auto-harvested: 🍅 12 · Big ×1.5 · Combo ×1.2". The harvested tiles pop away and a floating "+12" rises over the board.

### 5.2 Emergency Harvest

A one-shot joker for a field clogged with groups too small to auto-harvest.

* A big red **🚨 Emergency** button is fixed to the bottom-right of the screen. It shrinks on narrower screens (smaller pill, then icon only) to stay clear of the game area.

* Clicking it harvests **every crop on the field**, without any bonuses (size, level or combo), and resets the combo.

* The player starts with 1 charge and can hold at most 1. Once used, the button shows "Used" until restocked.

* It is disabled while the field is empty.

* **Restock:** In the Shop, for **2% of the player's coins, at least 50**. It stays a cheap rescue early on but remains a real decision for a rich player (e.g. 2,469 coins at 123,456 coins).

### 5.3 End of Season

* Whatever is still planted when a market visit ends (sale finished or season skipped) is discarded. Each season starts with an empty field and no combo.

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

* **Price:** Adjust each crop's unit price with − / +. The panel shows the expected share of buyers at that price (e.g. "Price: 13 · ~53% of buyers" for Tomato, base price 11).

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

### 6.5 Contracts

Short goals between unlocks: deliver a quantity of one crop to one market within a few visits for a guaranteed reward.

* **Offers:** After each market visit the Shop offers **2 contracts**. Each asks for one crop the player has unlocked, at an open market that buys it.

  * Offers favour crops harvested at the last market visit, so a contract never pushes a new crop type into the seed mix (which would clog the field for many seasons). With no history yet, any unlocked crop can be asked for.

  * Offers never repeat the crop and market of an active contract. Offers not accepted are replaced at the next visit.

* **Quantity:** 30% of the units brought to the last market visit, rounded to 5, at least 10. Contracts grow with the farm.

* **Deadline:** 2–4 market visits, counting the next one.

* **Reward:** $\text{Quantity} \times \text{Base Price} \times 1.5$, rounded, e.g. 10 Tomato → 165 coins.

* **Accepting:** Click Accept in the Shop. At most **2 contracts** can be active.

* **Delivery:** When selling at the contract's market with at least the full quantity of the crop, those units are set aside before customers arrive (all at once, never partly). The reward is paid together with the sale revenue. Delivered units don't count against customer demand.

* **Expiry:** A contract not delivered by its last visit expires with no penalty.

* **Where contracts are shown:** a Contracts panel in the sidebar (progress with the current harvest and visits left), the Marketplace panel for the selected market ("delivered when you start selling" or "need N more"), the Shop, and the sale report ("Contracts delivered").

* **Saving:** Delivered contracts are recorded with the sale result when selling starts, so quitting mid-sale can't pay a reward twice or lose it.

## 7. Time, Goal & Game Endings

### 7.1 Calendar & Age

* Each finished market visit (or skipped season) advances time by one visit.

* **2 visits per season**, alternating summer and winter; **4 visits per year**.

* The player starts at **age 20** and ages one year every 4 visits; age 85 is reached after 260 visits.

* The HUD shows Round, Season, Age, Coins / Goal, and the **Next Goal**.

* **Next Goal:** The next thing worth saving for, with a progress bar: the cheapest locked market, or the cheapest locked crop that an open market buys. It reads "ready" once affordable (unlock it in the Shop after the next sale). Once everything is unlocked, it shows progress toward 1,000,000 coins.

  * Farm upgrades (the Hold slot) are part of the ladder. In a typical run the order is Pumpkin → Beetroot → Hold slot → Town market → Onion → Cherry → City market → Eggplant → Watermelon → Millionaire.

### 7.2 Endings

Game endings are evaluated on the main screen, after the sale summary has been closed.

* 🏆 **Millionaire (Win):** Reach 1,000,000 coins. The score is the age at which it happened.

* 🪦 **Game Over:** Reach age 85 without becoming a millionaire.

* 💸 **Bankrupt:** No seeds, no harvested crops, an empty field, and fewer coins than the cheapest unlocked seed pack.

* Running low on coins alone does not end the game.

## 8. Shop

Opens after each market visit (or skipped season) as a full screen with groups of square tiles (emoji, name, and price or status). The player's coins are shown at the top; **Done** closes the Shop and starts the next season with a fresh hand.

* **🌱 Crops:** One tile per crop, ordered by unlock price.

  * **Locked crops** show 🔒 and their unlock price; clicking unlocks the crop (and selects it).

  * **Unlocked crops** show their level; clicking selects the crop. The selected crop's actions appear below the tiles: **Buy 10 seeds** (seed pack price) and **Upgrade** to the next level (price and the new yield multiplier, see §4.2), or "Max level".

* **🏡 Farm & Markets:** Tiles for the **Hold slot** (1,500; see §3.2), the **Town** (2,000) and **City** (25,000) markets, and the **Emergency** restock (2% of coins, at least 50). Bought items show Owned / Open, and Emergency shows Ready while a charge is held.

* **📜 Contracts:** Accept up to 2 of the new offers (see §6.5); active contracts are listed with their visits left.

* **Feedback:** Tiles the player can't afford are dimmed but still clickable, and clicking explains why nothing happened ("Not enough coins for that yet."). The tile matching the HUD's next goal is highlighted.

## 9. Main Menu & Saving

* **Main Menu:** Shown when the game starts.

  * **Continue** (only when a save exists), with a summary of the saved run: age, season, coins and round.

  * **New Game.** When a save exists, it asks for a second click before replacing it.

  * The **best result**, e.g. "Best: millionaire at age 33", or the highest fortune if the player has never won.

* **Menu Button (☰):** In the top bar; saves and returns to the main menu. Not available during a sale.

* **Autosave:** Progress is saved after every change (placements, harvests, purchases, prices, season changes). Only game progress is stored; open panels and drag state are not.

* **Sales Can't Be Re-Rolled:** The sale result is saved when selling starts. Quitting during the sale animation and continuing shows that sale's summary instead of running a new one.

* **End of a Run:** When a game ends (win, death or bankruptcy), the save is cleared and the best result is updated. The end screen offers **Play again** and **Main menu**.

* **Storage:** Saves live in the browser's local storage, so each browser (and the desktop app) has its own save. The desktop app serves the game on a fixed local port (47101) so its save survives restarts; if that port is busy, it falls back to a random port and saves from other launches are not visible.

## 10. Balance

The economy is tuned with a headless simulation that plays whole careers with the real game code: hand and swap, placement, auto-harvest, Emergency, market, shop and calendar.

* **Run:** `npm run balance -- [tilesPerVisit] [runs]` (defaults: 100 tiles, 10 careers).

* **Bot Player:** Picks the placement and rotation that best grows groups or completes them (valuing completed groups by their real yield, so bigger groups score higher), swaps when Next is better, prices each crop to maximise expected revenue, unlocks crops and markets while keeping a seed reserve, upgrades only when supply falls short of demand, restocks the Emergency harvest, and accepts contracts for its target market when they ask for a crop it already grows (planting extra for them).

* **Effort** (crop tiles planted per visit) is the key input: with auto-harvest, the field size does not cap output.

* **Current Results:**

| Tiles per Visit | 40 | 60 | 100 | 160 |
| ----- | ----- | ----- | ----- | ----- |
| **Reached 1,000,000** | 0/40 | 39/40 | 40/40 | 40/40 |
| **Median Age at 1,000,000** | — | 65 | 54 | 54 |

* Town is typically unlocked around age 21 and City around age 24–27.

* The bot delivers about 0.7–1 contract per visit. Contract rewards (1.5× base price) were tuned to keep the engaged player near age 55; at 2× the engaged player became a millionaire around age 50.

* Returns diminish above roughly 75 tiles per visit, because the field clogs faster than groups clear. Emergency is the main way to clear a clogged field; with its price at 2% of coins the bot uses it on about 60% of visits.

* Very light play (about 40 tiles per visit) rarely reaches a million.

* An engaged run is about 140 visits of around 18 placements each.

* The bot looks only one move ahead, so it still harvests mostly at exactly 5 tiles; the size bonus mainly raises the ceiling for players who plan bigger groups.

## 11. Planned & Open Items

### 11.1 Random Events (Not Implemented)

Planned to occur automatically on a regular cycle. Examples:

* **Shortage:** Specific crop price multiplier skyrockets.

* **Bumper Crop / Glut:** Demand drops for specific items.

* **Fad / Trend:** High demand for specific seasonal items in specific locations.

### 11.2 Open Design Questions

* **Emergency harvest is load-bearing.** Its price now scales with wealth (2% of coins), but the simulation shows it is still the main way to clear a field clogged with small groups, so a higher price mostly shortens visits. Fixing the clogging itself (e.g. a seed bag, see the variety question below) would let Emergency become a true rescue.

* **City's 4-type variety minimum is hard for light players.** Because tetrominoes mix all seed types at random, minor crops rarely form groups of 5. Options: let the player choose which seeds go into tetrominoes, lower City's minimum to 3, or relax how variety is counted.

* **Bigger fields were tested and postponed.** Field upgrades (7×7, 8×8) remove most field clogging, which makes the whole economy much faster: even a single 7×7 upgrade moved the engaged player's millionaire age from ~54 to ~40, almost regardless of its price (5,000 to 100,000). Restoring age ~55 by lowering crop prices widened the gap between casual and heavy players instead. Field size is worth revisiting together with a decision on game length or the seed-bag idea. The board and drag code already read the field size from the grid, so adding sizes later is easy.

* **Game length.** If a shorter game is wanted, make each visit richer rather than reducing the number of visits.

## 12. Technical & Architectural Guidelines

* **Code Layout:**

  * `app.js` — game state, rules, rendering and input handling (the entry module loaded by `index.html`).

  * `src/config/crops.js` — crops, crop economy, seed config and upgrade costs, markets, demand curve, harvest and Emergency constants.

  * `src/config/game.js` — calendar, ages, the coin goal, and farm upgrade prices.

  * `src/config/shapes.js` — tetromino shapes.

  * `src/state/gridState.js` — grid creation, placement validation and connected-group detection.

  * `src/state/inventoryState.js` — seed and harvest stock helpers.

  * `src/state/saveState.js` — save/load: serializing progress, restoring older saves with defaults, and safe localStorage access.

  * `electron/main.js` — the desktop app; serves the game on a fixed local port so saves persist.

  * `scripts/balance.mjs` — the balance simulation.

  * `src/main.js`, `src/state/gameState.js`, `src/state/handState.js` and `src/state/marketState.js` are older, unused prototypes that do not reflect the current rules.

* **State Management:** A single mutable `state` object in `app.js`; rule functions update it and call `render()`, which also autosaves. Screen choice (main menu or game) lives in a separate `uiState` that is not saved.

* **Tests:** `npm test` runs the Node test suite in `tests/`.

* **Visual Style: Cozy Cartoon** (based on the Cropfall prototype art):

  * **Palette:** Defined once as CSS variables in `styles.css`: cream surfaces (`#fff3cf`, `#fadeb4`, `#eac690`), wood (`#de9e4e`, `#eabf79`, `#965f29`, outline `#915521`), empty field cells `#fee0b1`, soil under crops `#8c5735`, sky `#c9ebf2`, grass greens (`#c8d95e`, `#b0c85b`, leaf `#9dbf3d`), and tomato red `#e8413c` for warnings. Colors are not hardcoded in `app.js`.

  * **Typography:** Fredoka (bundled in `fonts/`, so it also works offline in the desktop app). Titles, button labels and big HUD values use white lettering with a thick dark-brown outline; body text is dark brown on cream.

  * **Shapes:** Chunky pill and square buttons with a brown outline, a light outer rim and a soft drop; panels are cream with the same outline. The field sits in a wooden frame, planted cells show dark soil, and hand cards are wooden trays.

  * **Scene:** A CSS-drawn sky with clouds and rolling green hills behind everything; overlays (market, shop, menus) use a light cream tint with a soft blur so the scene stays sunny.

  * *Current status:* Crops are still emoji, and the background is drawn in CSS. Dedicated crop icons (transparent PNGs, about 256×256) and a background illustration from the prototype can replace them later.
