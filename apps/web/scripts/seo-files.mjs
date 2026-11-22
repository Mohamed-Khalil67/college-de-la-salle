// Usage: node scripts/seo-files.mjs [browser output folder]   (run by `npm run build` as postbuild)
//
// Writes robots.txt and sitemap.xml next to the prerendered pages of this build: the sitemap lists every
// prerendered public page (each folder holding an index.html, the client shell index.csr.html left out) with the
// absolute address of the build's site (scripts/site-origin.mjs); robots.txt keeps crawlers out of the spaces, the
// sign-in pages and the API, and names the sitemap. The school comes from the generated profile, like the build.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteOrigin } from './site-origin.mjs';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(web, 'dist/college-website/browser'));
if (!existsSync(join(out, 'index.html'))) {
  console.error(`seo-files: no prerendered index.html in ${relative(web, out)}; build first.`);
  process.exit(1);
}

const schools = resolve(web, '../../schools');
const id = (process.env.SCHOOL || 'cdls-daher').trim();
const profile = JSON.parse(readFileSync(join(schools, id, 'profile.json'), 'utf8'));
const origin = siteOrigin(profile);

/** The page addresses (`/`, `/histoire`, `/bac-nationale`) of the folders that hold a prerendered index.html. */
function pages(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...pages(path));
    else if (name === 'index.html') {
      const html = readFileSync(path, 'utf8');
      if (/<meta[^>]+name="robots"[^>]+noindex/i.test(html)) continue;
      const rel = relative(out, dir).split('\\').join('/');
      found.push(rel ? `/${rel}` : '/');
    }
  }
  return found;
}

const urls = pages(out).sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

writeFileSync(
  join(out, 'sitemap.xml'),
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escape(origin + (url === '/' ? '/' : url))}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n'),
);

// The spaces and the sign-in pages are private or useless to a search engine; the calendar feed address is a
// credential (it also answers noindex). Everything else (the public pages, their photos) may be crawled.
const PRIVATE = ['/api/', '/connexion', '/premier-acces', '/eleve', '/enseignant', '/admin'];
writeFileSync(
  join(out, 'robots.txt'),
  ['User-agent: *', ...PRIVATE.map((path) => `Disallow: ${path}`), '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n'),
);

console.log(`seo-files: robots.txt and sitemap.xml (${urls.length} pages) for ${origin}`);
