// Builds a version of the game that opens straight from disk (double-click www/index.html).
//
// Browsers refuse to load ES module scripts from file:// pages, so app.js and everything it imports
// are bundled into one ordinary script. The stylesheet, fonts and page are copied next to it. The
// output folder is also where a mobile wrapper such as Capacitor expects the web app.
//
// Usage: npm run build:web
import { build } from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'www');

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);

await build({
  entryPoints: [join(root, 'app.js')],
  outfile: join(outDir, 'app.js'),
  bundle: true,
  // A plain script (not a module), so it also runs from file://.
  format: 'iife',
  target: 'es2020',
  minify: true,
  legalComments: 'none',
});

cpSync(join(root, 'styles.css'), join(outDir, 'styles.css'));
cpSync(join(root, 'fonts'), join(outDir, 'fonts'), { recursive: true });

const page = readFileSync(join(root, 'index.html'), 'utf8');
const moduleScript = '<script type="module" src="./app.js"></script>';
if (!page.includes(moduleScript)) {
  throw new Error(`index.html no longer contains ${moduleScript}; update scripts/build-web.mjs`);
}
// `defer` runs the script after the page is parsed, as module scripts are.
writeFileSync(join(outDir, 'index.html'), page.replace(moduleScript, '<script defer src="./app.js"></script>'));

console.log('Built www/: open www/index.html directly in a browser.');
