import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// pdfjs-dist is a transitive dependency of react-pdf and may not be hoisted,
// so resolve it from react-pdf's location.
const reactPdfRoot = dirname(require.resolve('react-pdf/package.json'));
const pdfjsRoot = dirname(
  require.resolve('pdfjs-dist/package.json', { paths: [reactPdfRoot] }),
);
const { version } = require(join(pdfjsRoot, 'package.json'));

const dest = join(process.cwd(), 'public', 'pdfjs');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });

cpSync(
  join(pdfjsRoot, 'build', 'pdf.worker.min.mjs'),
  join(dest, 'pdf.worker.min.mjs'),
);
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(pdfjsRoot, dir), join(dest, dir), { recursive: true });
}

console.log(`Copied pdf.js ${version} assets to public/pdfjs`);
