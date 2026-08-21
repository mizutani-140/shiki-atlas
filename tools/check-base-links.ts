/**
 * Fail the build when a root-absolute internal link in dist/ omits the configured
 * `base`.
 *
 * Starlight prefixes `base` onto sidebar entries it generates, but NOT onto links
 * we author ourselves — hero `actions[].link` in frontmatter and plain markdown
 * links. On a project Pages site those render as `/github/...` instead of
 * `/shiki-atlas/github/...` and 404 once deployed, while looking correct in a
 * local `astro dev` run rooted at `/`.
 *
 * `base` is read from astro.config.mjs as TEXT rather than imported: importing the
 * config pulls in the Starlight integration chain, which loads `.jsonc` theme files
 * that only Astro's Vite pipeline can resolve (ERR_UNKNOWN_FILE_EXTENSION under a
 * bare node/tsx run). Parsing keeps this check in sync with the config without
 * executing it.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');
const CONFIG = join(ROOT, 'astro.config.mjs');

/** Root-absolute href/src values, excluding protocol-relative `//host` URLs. */
const LINK_RE = /(?:href|src)="(\/(?!\/)[^"]*)"/g;

async function readBase(): Promise<string> {
  const source = await readFile(CONFIG, 'utf8');
  const match = source.match(/^\s*base:\s*['"]([^'"]*)['"]/m);
  if (!match) {
    throw new Error(
      `could not read \`base\` from ${CONFIG}. If the site no longer sets a base, ` +
        'delete this check; do not let it pass silently.',
    );
  }
  return match[1].replace(/\/+$/, '');
}

async function htmlFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(
    entries.map(async (entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return htmlFiles(full);
      return entry.name.endsWith('.html') ? [full] : [];
    }),
  );
  return found.flat();
}

const BASE = await readBase();
const offenders: string[] = [];

for (const file of await htmlFiles(DIST)) {
  const html = await readFile(file, 'utf8');
  const bad = new Set<string>();
  for (const [, link] of html.matchAll(LINK_RE)) {
    if (link === BASE || link.startsWith(`${BASE}/`)) continue;
    bad.add(link);
  }
  for (const link of [...bad].sort()) {
    offenders.push(`${file.slice(ROOT.length)}: ${link}`);
  }
}

if (offenders.length > 0) {
  console.error(`Internal links missing the "${BASE}" base prefix (they will 404 once deployed):`);
  for (const offender of offenders) console.error(`  ${offender}`);
  console.error('\nAuthor-written links (hero actions, markdown links) must include the base.');
  process.exit(1);
}

console.log(`check:links — all internal links carry the "${BASE}" base prefix.`);
