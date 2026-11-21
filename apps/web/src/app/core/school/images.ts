import type { ImageLoaderConfig } from '@angular/common';
import { GENERATED_IMAGE_WIDTHS } from './images.generated';

/**
 * The widths NgOptimizedImage writes in a responsive `srcset` (with `sizes`), the same steps as the WebP copies
 * of scripts/responsive-images.mjs: a phone takes 480 or 768, a laptop 1080, a large screen the original.
 */
export const IMAGE_BREAKPOINTS: readonly number[] = [480, 768, 1080, 1600];

/**
 * The address of a photo for a wanted width: the narrowest WebP copy at least that wide (`/images/x-768w.webp`),
 * or the original when there is none (wider than every copy, an SVG, a photo without copies, no width asked).
 * `widths` is the manifest written by select-school.mjs (the copies of this build's school pack).
 */
export function photoUrl(
  config: Pick<ImageLoaderConfig, 'src' | 'width'>,
  widths: Readonly<Record<string, readonly number[]>> = GENERATED_IMAGE_WIDTHS,
): string {
  const src = config.src.startsWith('/') ? config.src : `/${config.src}`;
  const copies = widths[src];
  const wanted = config.width;
  if (!copies || wanted === undefined) return config.src;
  const copy = copies.find((w) => w >= wanted);
  return copy === undefined ? config.src : src.replace(/\.(?:jpe?g|png)$/i, `-${copy}w.webp`);
}
