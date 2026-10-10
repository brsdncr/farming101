# Game Design Document (GDD)

## 1. Overview & Vision

A pixel-art tile-placement and farming economy strategy game. Players manage a farm grid, strategically placement crop-filled tetraminos based on their inventory, harvest connected crops, and simulate market trading in different locations while competing against AI vendors.

* **Visual Style:** 100% Pixel Art (all sprites, icons, tiles, UI components, and typography must adhere to pixel art aesthetics).

* **Language:** English.

## 2. Core Game Loop

1. **Spawn Tetraminos:** Fill 3 active tetramino slots using crops dynamically drawn from the player's stock pool and managed by a 14-piece shape bag generator.

2. **Placement Phase:** Drag/drop and rotate tetraminos onto the 6x6 grid. Placement invalidates if tiles are occupied or out of bounds.

3. **Harvest Phase:** Select connected crop groups and harvest them for base coins (incurring a harvest operational cost).

4. **Market Phase:** Take harvested stock to Village, Town, or City; set prices, quantity, and run the sales simulation.

5. **Random Events:** Every 4 rounds, trigger macro events (price spikes, shortages, demand surges).

## 3. Grid & Tetramino Placement System

### 3.1 Grid Mechanics

* **Grid Size:** $6 \times 6$ tiles.

* **Rules & Validation:**

  * Each tile can hold 1 crop unit or remain empty/soil.

  * Placement **fails** if any tile under the targeted shape is already occupied by a crop or falls outside the $6 \times 6$ boundaries.

  * If placement fails, the tetramino returns to its original slot holder in the hand.

### 3.2 Tetramino Definitions & Controls

Standard 4-block polyominos (7 types):

* **Shapes:** `I`, `L`, `J` (Reverse L), `S`, `Z`, `T`, `O`.

* **Bag Generation Algorithm:** Shapes are drawn from a 14-piece bag cycle where each of the 7 tetramino types appears exactly twice per 14 draws ($2 \times I, 2 \times L, 2 \times J, 2 \times S, 2 \times Z, 2 \times T, 2 \times O$).

* **Controls:** 

  * **Placement:** Drag-and-drop.

  * **Rotation:** Mouse wheel scroll or touchpad up/down gesture.

### 3.3 Dynamic Stock & Tetramino Generation Algorithm

* **Initial Starting Stock:**

  * $20 \times \text{Tomato}$

  * $20 \times \text{Carrot}$

* **Stock Depletion & Probability Shift:**

  * As a crop is used to fill a tetramino block, it is subtracted from the player's inventory pool.

  * Block filling uses weighted random selection based on remaining crop counts.

  * *Example:* If inventory has 17 Tomatoes and 19 Carrots, the probability of the next individual block being a Carrot is $\frac{19}{36}$.

* **Partial/Depleted Generation:**

  * When a tetramino slot is emptied, a new shape is generated and filled from available stock.

  * If total remaining stock $< 4$, the tetramino shape is generated normally, but filled with only available crops. Unfilled blocks act as "empty grid tiles" when placed.

## 4. Seasonal Crops

### Winter Crops

* Pumpkin

* Carrot

* Onion

* Beetroot

### Summer Crops

* Cherry

* Watermelon

* Tomato

* Eggplant

## 5. Harvest System

### 5.1 Selection & Execution

* **Group Highlight:** Clicking on any crop highlights its orthogonally connected group (same crop type).

* **Action:**

  * Click **Harvest Button** OR **Double-Click** the crop group to trigger harvest.

  * Harvested tiles are cleared back to empty grid tiles.

### 5.2 Economy & Yield

* **Gross Revenue:** Player receives $+1 \text{ Coin}$ per harvested tile in the connected cluster.

* **Harvest Operational Cost:** A flat fee of $-5 \text{ Coins}$ per harvest action.

* *Net Revenue Formula:* $\text{Earned} = \text{Cluster Size} - 5 \text{ Coins}$.

## 6. Marketplace & Sales Simulation

### 6.1 Marketplace UI

Accessible via the **Marketplace Button** in the top-right corner.

* **Item Selection:**

  * Select harvested inventory quantity to sell (Left/Right arrow selectors).

  * Set unit price per item type (Left/Right arrow selectors).

* **Location Selection:**

| Location | Entry Fee | Customer Traffic Range | AI Competitors | 
| ----- | ----- | ----- | ----- | 
| **Village** | 10 Gold | $50 - 100$ | 1 Competitor | 
| **Town** | 100 Gold | $250 - 750$ | 2 Competitors | 
| **City** | 250 Gold | $1000 - 5000$ | 3 Competitors | 

### 6.2 Sales Simulation Logic

* Clicking **"Start Selling"** triggers a fast automated market simulation.

* Customers make buying decisions based on:

  * Price comparison between Player and AI Competitors.

  * Product availability and demand logic.

* **Spoil/Waste Penalty:** Unsold goods taken to the marketplace are not returned to inventory—they decay/get thrown away at the end of the market phase.

## 7. Random Events (Every 4 Rounds)

Occurs automatically every 4th cycle. Examples:

* **Shortage:** Specific crop price multiplier skyrockets.

* **Bumper Crop / Glut:** Demand drops for specific items.

* **Fad / Trend:** High demand for specific seasonal items in specific locations.

## 8. Technical & Architectural Guidelines for Copilot

* **State Management:** Keep strict separation between `GridState`, `InventoryState`, `HandState` (3 tetraminos), and `MarketState`.

* **Pixel Art Standard:**

  * Uniform pixel scale/aspect ratio.

  * Custom retro font or pixel-perfect text rendering.

  * No high-resolution vector assets or smooth gradients.