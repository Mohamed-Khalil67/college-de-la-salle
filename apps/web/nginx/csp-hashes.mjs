// Usage: node csp-hashes.mjs <browser-build-dir> <output-file>
// Writes an nginx snippet with the Content-Security-Policy, whose script-src lists the sha256 of every
// inline executable <script> found in the built HTML files (JSON data blocks need no permission).
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [root, out] = process.argv.slice(2);
if (!root || !out) throw new Error('usage: csp-hashes.mjs <dir> <out>');

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* htmlFiles(path);
    else if (name.endsWith('.html')) yield path;
  }
}

const hashes = new Set();
for (const file of htmlFiles(root)) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\ssrc=)([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/type\s*=\s*["']application\/(json|ld\+json)["']/.test(m[1])) continue;
    hashes.add(`'sha256-${createHash('sha256').update(m[2]).digest('base64')}'`);
  }
  if (/\son[a-z]+\s*=\s*["']/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) {
    throw new Error(`${file} has an inline event handler attribute; the CSP would block it.`);
  }
}

const policy = [
  "default-src 'self'",
  `script-src 'self' ${[...hashes].join(' ')}`.trim(),
  // Angular writes style attributes and component styles at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
writeFileSync(out, `add_header Content-Security-Policy "${policy}" always;\n`);
console.log(`CSP written to ${out} with ${hashes.size} inline script hash(es).`);
