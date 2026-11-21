import { describe, expect, it } from 'vitest';
import { photoUrl } from './images';

const WIDTHS = { '/images/school/campus.jpg': [480, 768, 1080] };

describe('photoUrl', () => {
  it('gives the narrowest WebP copy at least as wide as asked', () => {
    expect(photoUrl({ src: '/images/school/campus.jpg', width: 400 }, WIDTHS)).toBe('/images/school/campus-480w.webp');
    expect(photoUrl({ src: '/images/school/campus.jpg', width: 721 }, WIDTHS)).toBe('/images/school/campus-768w.webp');
    expect(photoUrl({ src: '/images/school/campus.jpg', width: 1080 }, WIDTHS)).toBe('/images/school/campus-1080w.webp');
  });

  it('falls back to the original above the last copy, without a width, and for photos without copies', () => {
    expect(photoUrl({ src: '/images/school/campus.jpg', width: 1600 }, WIDTHS)).toBe('/images/school/campus.jpg');
    expect(photoUrl({ src: '/images/school/campus.jpg' }, WIDTHS)).toBe('/images/school/campus.jpg');
    expect(photoUrl({ src: '/images/hero.svg', width: 480 }, WIDTHS)).toBe('/images/hero.svg');
  });

  it('reads a path written without its leading slash', () => {
    expect(photoUrl({ src: 'images/school/campus.jpg', width: 480 }, WIDTHS)).toBe('/images/school/campus-480w.webp');
  });
});
