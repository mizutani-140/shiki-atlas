// Build-time generator: read this repository's own .shiki mirror and emit the
// Shiki internal-flow Mermaid diagram consumed by the Starlight site.
//
// Run with `npm run gen:diagram`. The output is committed; CI regenerates it and
// fails on drift (see .github/workflows/pages.yml), proving the diagram is
// generated from real .shiki data rather than hand-drawn.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMermaid, loadShikiState } from './diagram/model.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const outFile = join(root, 'src', 'generated', 'shiki-flow.mmd');

const mermaid = buildMermaid(loadShikiState(root));
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, mermaid, 'utf8');

console.log(`Generated ${outFile} (${mermaid.length} bytes)`);
