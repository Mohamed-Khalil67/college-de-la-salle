/**
 * The fixed palette of activity types: each colour token of @cdls/shared maps to a solid (borders, icons)
 * and a tint (backgrounds) taken from the design tokens, plus the French names and icon names the forms
 * show. The text on a tint is always the body colour, so the colour is never the only cue. Contrast is
 * checked in activity-palette.spec.ts. No Angular here.
 */
import { ACTIVITY_COLOURS, ACTIVITY_ICONS, type ActivityColour, type ActivityIcon } from '@cdls/shared';

export interface ColourSwatch {
  readonly token: ActivityColour;
  readonly label: string;
  /** CSS value of the solid colour (a design token). */
  readonly solid: string;
  /** CSS value of the tint. */
  readonly tint: string;
  /** The same two colours as hex values, for the contrast check. */
  readonly solidHex: string;
  readonly tintHex: string;
}

export const COLOUR_SWATCHES: Readonly<Record<ActivityColour, ColourSwatch>> = {
  navy: { token: 'navy', label: 'Bleu', solid: 'var(--color-navy-700)', tint: 'var(--color-navy-100)', solidHex: '#22406e', tintHex: '#e3e9f2' },
  green: { token: 'green', label: 'Vert', solid: 'var(--color-green-700)', tint: 'var(--color-green-100)', solidHex: '#2e6b45', tintHex: '#e4eee6' },
  gold: { token: 'gold', label: 'Or', solid: 'var(--color-gold-700)', tint: 'var(--color-gold-100)', solidHex: '#806218', tintHex: '#f4ead0' },
  brick: { token: 'brick', label: 'Brique', solid: 'var(--color-brick-700)', tint: 'var(--color-brick-100)', solidHex: '#8e3a2b', tintHex: '#f6e6e1' },
  red: { token: 'red', label: 'Rouge', solid: 'var(--color-red-700)', tint: 'var(--color-red-100)', solidHex: '#a3262a', tintHex: '#f7e4e1' },
  stone: { token: 'stone', label: 'Pierre', solid: 'var(--color-ink-600)', tint: 'var(--color-parchment-100)', solidHex: '#565d6b', tintHex: '#f1ebdd' },
};

/** The text colour on every tint (ink 900). */
export const CHIP_TEXT_HEX = '#1e2430';
export const SURFACE_HEX = '#ffffff';

export const COLOUR_OPTIONS: readonly ColourSwatch[] = ACTIVITY_COLOURS.map((token) => COLOUR_SWATCHES[token]);

/** A colour the API may not know (older data): falls back to stone so the chip still renders. */
export function swatchOf(token: string): ColourSwatch {
  return COLOUR_SWATCHES[token as ActivityColour] ?? COLOUR_SWATCHES.stone;
}

export const ICON_LABELS: Readonly<Record<ActivityIcon, string>> = {
  book: 'Livre',
  users: 'Groupe',
  edit: 'Crayon',
  'file-text': 'Document',
  check: 'Coche',
  clock: 'Horloge',
  calendar: 'Calendrier',
  'map-pin': 'Lieu',
  bell: 'Cloche',
  eye: 'Œil',
};

export const ICON_OPTIONS: readonly { readonly name: ActivityIcon; readonly label: string }[] = ACTIVITY_ICONS.map((name) => ({
  name,
  label: ICON_LABELS[name],
}));

/** WCAG relative luminance of a `#rrggbb` colour. */
export function luminance(hex: string): number {
  const channel = (offset: number): number => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two `#rrggbb` colours (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Flags of a type, as the short badge labels shown in the lists. */
export function flagLabels(flags: { readonly gradable: boolean; readonly repeatable: boolean; readonly homework: boolean }): string[] {
  return [flags.gradable ? 'Noté' : '', flags.repeatable ? 'Chaque semaine' : '', flags.homework ? 'Devoir à rendre' : ''].filter(Boolean);
}

/** The rule the API enforces: a homework is due on one day and never repeats weekly. */
export function flagsProblem(flags: { readonly repeatable: boolean; readonly homework: boolean }): string | null {
  return flags.homework && flags.repeatable ? 'Un devoir à rendre ne se répète pas chaque semaine : décochez l’une des deux options.' : null;
}
