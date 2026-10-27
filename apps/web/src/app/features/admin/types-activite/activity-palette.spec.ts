import { ACTIVITY_COLOURS, ACTIVITY_ICONS } from '@cdls/shared';
import { describe, expect, it } from 'vitest';
import {
  CHIP_TEXT_HEX,
  COLOUR_OPTIONS,
  COLOUR_SWATCHES,
  contrastRatio,
  flagLabels,
  flagsProblem,
  ICON_LABELS,
  SURFACE_HEX,
  swatchOf,
} from './activity-palette';

describe('contrastRatio', () => {
  it('matches known WCAG values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1);
  });
});

describe('the activity palette', () => {
  it('covers every colour of the contract, in order', () => {
    expect(COLOUR_OPTIONS.map((s) => s.token)).toEqual([...ACTIVITY_COLOURS]);
  });

  it.each(ACTIVITY_COLOURS.map((c) => [c]))('%s: text on its tint is AA (4.5:1)', (token) => {
    expect(contrastRatio(CHIP_TEXT_HEX, COLOUR_SWATCHES[token].tintHex)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ACTIVITY_COLOURS.map((c) => [c]))('%s: border and icon are 3:1 on the tint and on white', (token) => {
    const { solidHex, tintHex } = COLOUR_SWATCHES[token];
    expect(contrastRatio(solidHex, tintHex)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(solidHex, SURFACE_HEX)).toBeGreaterThanOrEqual(3);
  });

  it('gives each colour and icon a French name', () => {
    expect(new Set(COLOUR_OPTIONS.map((s) => s.label)).size).toBe(ACTIVITY_COLOURS.length);
    for (const icon of ACTIVITY_ICONS) expect(ICON_LABELS[icon]).toBeTruthy();
  });

  it('falls back to stone for an unknown colour', () => {
    expect(swatchOf('mauve').token).toBe('stone');
    expect(swatchOf('gold').token).toBe('gold');
  });
});

describe('flags', () => {
  it('lists the options of a type in words', () => {
    expect(flagLabels({ gradable: true, repeatable: false, homework: false })).toEqual(['Noté']);
    expect(flagLabels({ gradable: false, repeatable: false, homework: false })).toEqual([]);
    expect(flagLabels({ gradable: true, repeatable: true, homework: false })).toEqual(['Noté', 'Chaque semaine']);
  });

  it('refuses a weekly homework like the API does', () => {
    expect(flagsProblem({ repeatable: true, homework: true })).toContain('ne se répète pas');
    expect(flagsProblem({ repeatable: false, homework: true })).toBeNull();
  });
});
