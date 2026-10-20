# Game Design Document (GDD)

## 1. Overview & Vision

A cozy, cartoon-style tile-placement and farming economy strategy game. Players plant crop-filled tetrominoes on a small farm grid, grow connected groups of the same crop that harvest automatically, and sell the harvest in markets of increasing size. Profits buy new crops, seed upgrades and access to bigger markets.

* **Goal:** Become a millionaire (1,000,000 coins) as young as possible. The player starts at age 20 and dies at age 85.

* **Visual Style:** Cozy cartoon farm (see §12): a sunny farm scene, a wooden board with cream cells, chunky cream buttons with brown outlines, and bold rounded lettering with a dark outline.

* **Language:** English.

## 2. Core Game Loop

1. **Plant:** Place the current tetromino on the 6×6 field. The next tetromino is shown as a preview and can be swapped in.

2. **Auto-Harvest:** Any connected group of 5 or more same-crop tiles is harvested immediately, freeing its tiles. An **Emergency** button can harvest the whole field once.

3. **Market:** Whenever ready, take the harvested crops to an unlocked market, set prices, and run the sales simulation. Harvested crops go to market unless kept in the barn for a later visit; unsold crops spoil.

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

The calendar alternates between summer and winter (see §7), two market visits each.

* **Winter Crops:** Pumpkin, Carrot, Onion, Beetroot.

* **Summer Crops:** Cherry, Watermelon, Tomato, Eggplant.

* **Seasonal Demand:** Customers pay **20% more** for crops in season and **20% less** for crops out of season: the reference price (see §6.3) is the base price × 1.2 or × 0.8, combined with any market flooding (§6.8).

* **Shown:** The top bar shows the season with its emoji ("☀️ Summer", "❄️ Winter") and "(last visit)" on a season's final visit. In the Marketplace each crop has a chip ("☀️ Summer crop · +20%" or "❄️ Winter crop · −20%"), and the forecast includes the effect. In the Seed Shop, crops that will be in season at the next visit carry the season's emoji.

* **Balance:** The effect is flavour rather than strategy: it moves income between seasons but doesn't change what is worth growing. The summer crops include the three most valuable ones, and even out of season watermelon (−20%: 224) is worth far more than onion in season (+20%: 59), winter's best crop. Stronger effects were tested (up to +50% / −50%): the bot still grew the same crops all year and careers only got slower. Seasons could really change play after a winter-crop rebalance, and ideally the seed bag, since switching crop sets every season would mix both seasons' seeds into the blocks.

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
| **Town** | 2,000 | $300 - 500$ | 3 crop types | Village crops + Onion, Cherry |
| **City** | 25,000 | $1200 - 1800$ | 4 crop types | All crops |

* **Unlocking:** Town and City are unlocked with coins in the Shop. Locked markets are shown in the location list but cannot be selected.

* **Minimum Variety:** A trip must put on sale at least the listed number of crop types the market buys, each with at least **3 units** on sale (crops kept in the barn don't count). This prevents relying on a single crop.

  * **Contract leniency (deliberate):** Units a contract will take at this market still count toward the 3 units. Example: with 12 tomatoes and a 10-tomato contract, tomato counts as a variety crop although only 2 go on sale. Counting strictly could let a contract block a sale (and so its own delivery) unless the player grows another crop, which feels unfair, so the leniency was kept.

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

* **Harvested Crops:** Every harvested crop is listed with its quantity. Everything not kept in the barn or taken by a contract is offered for sale. When keeping or a contract lowers what customers get, an **On sale** count is shown next to the harvest (e.g. "Harvest: 14 · On sale: 4").

* **🛖 Keep for later:** Each crop has a − / + control for how many units to keep in the barn (see §6.7), including crops this market doesn't buy. It moves along multiples of 5, capped at what can be kept: with 27 harvested, + goes 25 → 27 and − goes 27 → 25. It shows how many come back after spoilage (e.g. "25 (22 come back)").

  * Crops the selected market does not buy are marked as spoiling.

* **Price:** Adjust each crop's unit price with − / +, in steps of 10% of its base price (at least 1 coin), so every crop takes about the same number of clicks. The change from the base price is shown next to it (e.g. "Price: 308 +10%").

* **📊 Forecast:** Below each price: how many customers want the crop, for the market's lowest and highest traffic, and the share who buy at this price (e.g. "23–45 customers want tomato · ~70% buy at this price"). Whether that sells out the stock is deliberately not shown: working it out is the pricing decision.

* **Status:** The panel shows variety progress (e.g. "Variety: 2/2 crop types with 3+ units"), customer traffic, and why selling is blocked, if it is.

* **Skip Season:** Offered only when no unlocked market accepts the harvest. It discards the harvest and the field and advances time (see §7.2).

### 6.3 Sales Simulation Logic

* Clicking **Start Selling** runs the simulation, then plays it as a **market day** in the spirit of Lemonade Tycoon (see §6.5). The result is fixed before the day starts.

* **Traffic:** A random number of customers within the market's traffic range visits.

* **Demand Curve:** A customer who wants a crop the player brought, while it is still in stock, buys one unit with probability:

  * $r = \frac{\text{Price}}{\text{Reference Price}}$, $\quad P(\text{buy}) = \dfrac{1}{1 + \frac{3}{7} e^{4(r - 1)}}$

  * 70% of customers buy at the base price; fewer buy as the price rises and more as it falls.

| Price vs Base | 0.5× | 0.75× | **1×** | 1.25× | 1.5× | 2× |
| ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| **Buyers** | 94% | 86% | **70%** | 46% | 24% | 4% |

* **Reference Price:** The crop's base price, adjusted for the season (§4.3) and lowered while the market is flooded with it (§6.8).

* **Pricing Strategy:** When demand exceeds stock, raising the price earns more while still selling out. When stock exceeds demand, lowering the price sells more.

* **Spoil/Waste Penalty:** Unsold crops, and crops the market does not buy, spoil at the end of the visit unless kept in the barn. Harvested crops never turn back into seeds; only unplanted seeds carry over.

### 6.4 Sale Report

After the sale, a summary shows revenue per crop and a funnel for the player's stall:

* **Wanted:** Customers who wanted a crop the player brought.

* **Served:** Of those, customers who arrived while that crop was still in stock.

* **Sold:** Of those, customers who accepted the price and bought.

* Gaps in the funnel point to the fix: Wanted ≫ Served means the crop sold out (raise prices or grow more); Served ≫ Sold means the price was too high.

* **Stock Ledger:** One row per crop on sale: **On sale** (units offered to customers), Sold, unit price, revenue and units left. When units were set aside, a note under the row explains the difference from the harvest (e.g. "🌾 14 harvested · 📜 10 to a contract", "🛖 25 kept").

* **Tips:** Each crop in the stock ledger gets one line of advice:

  * 📈 Sold out before 60% of the interested customers were served: charge more or bring more.
  * ✅ Sold out later than that: the price looks right.
  * 📉 Fewer than half of the customers served bought: try a lower price. Or, with enough interested customers for the whole stock but some left over: a slightly lower price would sell them.
  * 📦 Too few customers wanted it: bring fewer, or sell some at another market.

### 6.5 Market Day Animation

* **Scene:** A striped stall in a street. The stall shows each crop's stock, which counts down as units sell and greys out when sold out. A clock runs from 08:00 to 18:00 and a counter shows the coins taken.

* **Customers:** People emojis with varied natural skin tones. They arrive in their simulated order, spread over the day, from both sides. Stall visitors stop at the stall with a speech bubble: the crop and the coins paid, "Too pricey!" (price above 115% of the reference price, see §6.3) or "Not today", and "No 🍅 left" for customers who came after that crop sold out. Passers-by who wanted a crop the player didn't bring stroll past behind the stall, some thinking of it ("🍉?").

* **Sampling:** Only a sample of customers is shown (about one stall visitor per 0.55 s of the day), so big markets stay readable; the stock and coin counters still count every sale.

* **Length:** 150 ms per customer served, between 10 and 20 seconds at 1×. When every crop sells out, the market closes early ("Sold out! Closing early"); otherwise at sunset.

* **Controls:** ⏩ cycles the speed through 1×, 2× and 4× (kept for later days in the session). **Skip to results** settles the sale at once (enabled after 3 seconds). The report replaces the scene when the day ends.

### 6.6 Contracts

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

### 6.7 Barn

Keep harvested crops for a later market visit instead of selling them now. This deliberately relaxes the original rule that all harvested crops go to market.

* **Keeping:** In the Marketplace panel, set how many units of each crop to keep (− / +, along multiples of 5). The panel shows the barn's fill (e.g. "Barn: 18/30").

* **Capacity:** 30 units to start. Upgrades in the Shop: **60** (2,500) and **120** (15,000). Barn upgrades are part of the next-goal ladder.

* **At the sale:** Kept units are set aside first: they are not sold and can't fill contracts. The summary lists what was kept.

* **Spoilage:** Kept crops come back as harvest at the next visit, minus **10% of each kept crop, rounded up** (at least 1 unit).

* **Skipping a season** still discards the whole harvest, kept crops included.

* **Variety minimum:** Counts only crops offered for sale: kept units don't count, so the barn can't be used to sell a single crop while carrying a second one along.

* **Saving:** Kept crops are recorded with the sale result when selling starts, so quitting mid-sale can't duplicate or lose them.

* **Balance:** The barn is close to balance-neutral (median millionaire age 65/56/55 with the barn vs 65/54/54 without, for 60/100/160 tiles per visit): the bot usually sells out, so it rarely has anything worth keeping. Its value is situational: carrying crops a market doesn't buy to the next one, saving up for a contract, or building variety for Town or City.

### 6.8 Market Memory

Selling a crop floods that market for a while, and its customers pay less for it. This makes repeating the same visit less rewarding.

* **Flooding:** A sale adds (units sold ÷ the market's normal demand for the crop) × 1.5 to that crop's flood at that market, up to 60%. Normal demand is the crop's share of the market's average traffic. Example: 18 watermelons sold in the City, where about 94 customers normally want them, add about 29%.

* **Recovery:** After every market visit (or skipped season) the flooding at every market halves. Floods under 1% are forgotten.

* **Effect:** Customers judge the crop by a reference price that much lower than its base price (flooded by 30%: they buy watermelon as if it cost 196 instead of 280). The forecast's "% buy" and the "Too pricey!" bubbles use it.

* **Repeating:** Selling the same amount at the same market every visit settles at about the flood one sale adds: about −29% for City watermelon and eggplant and −15% for cherry and onion at the bot's usual volume. Skipping that crop or market for one visit halves it.

* **Village exempt:** Early on the Village is the only market and offers two crops, so there would be no way out. Town and City flood.

* **Shown:** In the Marketplace, under the forecast: "🥱 City has had plenty of watermelon lately: customers pay ~29% less" (from 5%). In the sale report, a 🥱 tip for each crop that was flooded at the sale.

* **Saving:** Flooding is saved with the game; older saves start with none.

* **Balance:** Market memory mostly acts as a late-game price cut: the City is the only buyer of watermelon and eggplant, the most valuable crops, so even at −29% the bot keeps selling them there. It moved the engaged player's millionaire age from 58 to 69 (see §10). Letting Town buy eggplant and watermelon too was tested: the bot then alternated City and Town on about a quarter of visits and reached the million at 63. It was not adopted, to keep Town at 6 crops.

## 7. Time, Goal & Game Endings

### 7.1 Calendar & Age

* Each finished market visit (or skipped season) advances time by one visit.

* **2 visits per season**, alternating summer and winter; **4 visits per year**.

* The player starts at **age 20** and ages one year every 4 visits; age 85 is reached after 260 visits.

* The HUD shows Round, Season, Age, Coins / Goal, and the **Next Goal**.

* **Next Goal:** The next thing worth saving for, with a progress bar: the cheapest locked market, or the cheapest locked crop that an open market buys. It reads "ready" once affordable (unlock it in the Shop after the next sale). Once everything is unlocked, it shows progress toward 1,000,000 coins.

  * Farm upgrades (the Hold slot and barn sizes) are part of the ladder. Buying each goal in turn gives Pumpkin → Beetroot → Hold slot → Town market → Onion → Barn 60 → Cherry → Barn 120 → City market → Eggplant → Watermelon → Millionaire (crops only count once a market that buys them is open).

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

* **🏡 Farm & Markets:** Tiles for the **Hold slot** (1,500; see §3.2), the **Barn** (upgrade to 60 for 2,500, then 120 for 15,000; see §6.7), the **Town** (2,000) and **City** (25,000) markets, and the **Emergency** restock (2% of coins, at least 50). Bought items show Owned / Open, and Emergency shows Ready while a charge is held.

* **📜 Contracts:** Accept up to 2 of the new offers (see §6.6); active contracts are listed with their visits left.

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

* **Bot Player:** Picks the placement and rotation that best grows groups or completes them (valuing completed groups by their real yield, so bigger groups score higher), swaps when Next is better, prices each crop to maximise expected revenue (taking market memory into account), unlocks crops and markets while keeping a seed reserve, upgrades only when supply falls short of demand, restocks the Emergency harvest, and accepts contracts for its target market when they ask for a crop it already grows (planting extra for them).

* **Effort** (crop tiles planted per visit) is the key input: with auto-harvest, the field size does not cap output.

* **Current Results:**

| Tiles per Visit | 40 | 60 | 100 | 160 |
| ----- | ----- | ----- | ----- | ----- |
| **Reached 1,000,000** | 0/40 | 35/40 | 39/40 | 37/40 |
| **Median Age at 1,000,000** | — | 78 | 69 | 75 |

* Town is typically unlocked around age 21 and City around age 27–32.

* **Seasonal demand** (§4.3, ±20%) is close to balance-neutral: before it, the results were 30/40 at age 79, 40/40 at 69 and 37/40 at 74.

* **Market memory** (§6.8) costs about 11 years at 100 tiles per visit: without it the results were 38/40 at age 68, 40/40 at 58 and 40/40 at 60.

* **Market size:** A visit brings roughly 60–110 units whatever the effort, because the 6×6 field caps output. Town and City traffic was trimmed (from 250–750 and 1,000–5,000) so prices matter more there: with the old City, about 15 customers wanted each unit brought and the bot sold out at ~1.65× the base price; now about 7–10 do, at ~1.4–1.5×. This made careers about 4–6 years longer. Making demand tighter still slows careers sharply (City 400–700: no bot reached 1,000,000), unless bigger markets pay more (see the roadmap's per-market prices).

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

* **A share-based variety rule was tested and postponed.** Requiring each counted crop to be at least 10% of what is sold (instead of 3 units) would stop token amounts of a second crop, but because blocks mix all seed types at random, minor crops are hard to grow in volume: about 40% of seasons became unsellable and engaged players rarely reached a million (5%: about 1–4 years slower, ~5 skipped seasons per career). Worth revisiting once players can control their seed mix (e.g. a seed bag).

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
