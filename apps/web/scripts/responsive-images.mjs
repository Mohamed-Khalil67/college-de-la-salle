// Smaller copies of the pack's photos for phones (called by select-school.mjs after it copied the pack's public/).
//
// For every JPEG or PNG photo under public/images/ wider than the smallest width, writes WebP copies at the
// RESPONSIVE_WIDTHS narrower than the original next to it, `<name>-<width>w.webp`, and returns the manifest
// { '/images/x.jpg': [480, 768, 1080] } that the app's image loader reads (src/app/core/school/images.ts). The
// copies are cached in apps/web/.cache/images/ by the photo's content, so only a changed photo is encoded again.
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/** The widths offered to the browser (phone, tablet or small laptop, large screen). */
export const RESPONSIVE_WIDTHS = [480, 768, 1080, 1600];
const PHOTO = /\.(?:jpe?g|png)$/i;
/** Logos and crest sources are not photos shown on the site. */
const SKIP = /(?:^|\/)(?:logo-source|CDLS)\.(?:jpe?g|png)$/i;

function photos(dir, base = dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return photos(path, base);
    const rel = relative(base, path).split('\\').join('/');
    return PHOTO.test(name) && !SKIP.test(rel) ? [rel] : [];
  });
}

/**
 * @param {string} publicOut the copied public folder (src/generated/public)
 * @param {string} cacheDir apps/web/.cache/images/<pack>
 * @returns {Promise<Record<string, number[]>>}
 */
export async function responsiveImages(publicOut, cacheDir) {
  const { default: sharp } = await import('sharp');
  const manifest = {};
  for (const rel of photos(join(publicOut, 'images'))) {
    const source = join(publicOut, 'images', rel);
    const { width = 0 } = await sharp(source).metadata();
    // Only narrower copies: at its own width the original JPEG is as small as a WebP of it, and the loader
    // falls back to it above the last copy.
    const widths = RESPONSIVE_WIDTHS.filter((w) => w < width);
    if (widths.length === 0) continue;
    // The content, not the date: the copy in src/generated/public is new on every run.
    const key = createHash('sha256').update(readFileSync(source)).digest('hex').slice(0, 16);
    const stem = rel.replace(PHOTO, '');
    for (const w of widths) {
      const name = `${stem}-${w}w.webp`;
      const cached = join(cacheDir, key, name);
      if (!existsSync(cached)) {
        mkdirSync(dirname(cached), { recursive: true });
        await sharp(source).resize({ width: w, withoutEnlargement: true }).webp({ quality: 68, effort: 5 }).toFile(cached);
      }
      const target = join(publicOut, 'images', name);
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(cached, target);
    }
    manifest[`/images/${rel}`] = widths;
  }
  return manifest;
}
