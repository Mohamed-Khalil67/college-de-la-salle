/**
 * Builds the tab and phone icons from the school's logo (public/images/school/logo-source.jpg):
 * the white background around the shield is made transparent, then the logo is fitted into square icons.
 *
 *   node scripts/make-icons.mjs
 *
 * Output: public/favicon.ico (16, 32, 48), public/icon-32.png, public/icon-192.png, public/apple-touch-icon.png
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const source = readFileSync('public/images/school/logo-source.jpg').toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

/** Renders the logo into a size×size PNG (data URL), transparent unless `background` is given. */
const render = (size, background) =>
  page.evaluate(
    async ({ source, size, background }) => {
      const img = new Image();
      img.src = `data:image/jpeg;base64,${source}`;
      await img.decode();

      // 1. Make the white outside the shield transparent: flood fill from the borders over near-white pixels.
      const w = img.naturalWidth, h = img.naturalHeight;
      const tmp = new OffscreenCanvas(w, h);
      const tctx = tmp.getContext('2d', { willReadFrequently: true });
      tctx.drawImage(img, 0, 0);
      const data = tctx.getImageData(0, 0, w, h);
      const px = data.data;
      const isWhite = (i) => px[i] > 232 && px[i + 1] > 232 && px[i + 2] > 232;
      const seen = new Uint8Array(w * h);
      const stack = [];
      for (let x = 0; x < w; x++) stack.push(x, x + (h - 1) * w);
      for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
      while (stack.length) {
        const p = stack.pop();
        if (seen[p] || !isWhite(p * 4)) continue;
        seen[p] = 1;
        px[p * 4 + 3] = 0;
        const x = p % w;
        if (x > 0) stack.push(p - 1);
        if (x < w - 1) stack.push(p + 1);
        if (p >= w) stack.push(p - w);
        if (p < w * (h - 1)) stack.push(p + w);
      }
      tctx.putImageData(data, 0, 0);

      // 2. Fit into a square, keeping the proportions, with a small margin.
      const out = new OffscreenCanvas(size, size);
      const ctx = out.getContext('2d');
      if (background) {
        ctx.fillStyle = background;
        ctx.fillRect(0, 0, size, size);
      }
      ctx.imageSmoothingQuality = 'high';
      const margin = Math.round(size * 0.06);
      const scale = (size - 2 * margin) / Math.max(w, h);
      const dw = w * scale, dh = h * scale;
      ctx.drawImage(tmp, (size - dw) / 2, (size - dh) / 2, dw, dh);
      const blob = await out.convertToBlob({ type: 'image/png' });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (const b of buf) s += String.fromCharCode(b);
      return btoa(s);
    },
    { source, size, background },
  );

const png = async (size, background) => Buffer.from(await render(size, background), 'base64');

const [p16, p32, p48, p192, p180] = await Promise.all([png(16), png(32), png(48), png(192), png(180, '#ffffff')]);
await browser.close();

// ICO container holding PNG images (supported by every current browser).
const images = [[16, p16], [32, p32], [48, p48]];
const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = 6 + 16 * images.length;
const entries = images.map(([size, data]) => {
  const e = Buffer.alloc(16);
  e[0] = size;
  e[1] = size;
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  return e;
});
writeFileSync('public/favicon.ico', Buffer.concat([header, ...entries, ...images.map(([, d]) => d)]));
writeFileSync('public/icon-32.png', p32);
writeFileSync('public/icon-192.png', p192);
writeFileSync('public/apple-touch-icon.png', p180);
console.log('Icons written to public/: favicon.ico, icon-32.png, icon-192.png, apple-touch-icon.png');
