# farming101

## Running the game

* **In the browser:** `npm start`, then open the address it prints. The source uses ES modules, which browsers only load from a web server, so opening `index.html` directly shows an empty page.
* **From disk (double-click):** `npm run build:web` bundles the game into `www/`; open `www/index.html` directly in any browser. Rebuild after changing the code.
* **Desktop app:** `npm run start:desktop`; installers with `npm run dist:mac` / `npm run dist:win`.
* **Tests and balance:** `npm test`; `npm run balance -- [tilesPerVisit] [runs]`.
