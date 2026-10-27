import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The folder rules of `apps/web/CLAUDE.md`, checked on every relative import:
 * - `core/` imports only `core/`; `shared/` only `core/` and `shared/`; `i18n/` and `school/` nothing from
 *   `features/` or `layout/`.
 * - A role space (`features/admin`, `features/eleve`, `features/enseignant`) is imported by nothing but itself
 *   and the app's routes: what two spaces need goes to `shared/` (or to a domain feature such as `timetable/`).
 * - A feature's own `shared/` folder is private to that feature.
 */
const APP = dirname(fileURLToPath(import.meta.url));
const ROLE_SPACES = new Set(['admin', 'eleve', 'enseignant']);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

interface Edge {
  readonly from: string;
  readonly to: string;
}

const edges: Edge[] = sources(APP).flatMap((file) => {
  const from = relative(APP, file).split(sep).join('/');
  return [...readFileSync(file, 'utf8').matchAll(/(?:from\s+|import\s*\(\s*)'(\.{1,2}\/[^']+)'/g)].map((m) => ({
    from,
    to: posix.normalize(posix.join(posix.dirname(from), m[1]!)),
  }));
});

/** `features/eleve/notes/x` → `features/eleve`; `core/api/x` → `core`. */
function area(path: string): string {
  const [top, second] = path.split('/');
  return top === 'features' ? `features/${second}` : top!;
}

function broken(rule: (edge: Edge) => boolean): string[] {
  return edges.filter(rule).map((e) => `${e.from} → ${e.to}`);
}

describe('architecture', () => {
  it('finds the sources', () => {
    expect(edges.length).toBeGreaterThan(500);
  });

  it('keeps core/ free of everything else', () => {
    expect(broken((e) => e.from.startsWith('core/') && area(e.to) !== 'core')).toEqual([]);
  });

  it('keeps shared/ free of features, layout and site content', () => {
    expect(broken((e) => e.from.startsWith('shared/') && !['core', 'shared'].includes(area(e.to)))).toEqual([]);
  });

  it('keeps i18n/ and school/ free of features and layout', () => {
    expect(
      broken((e) => /^(i18n|school)\//.test(e.from) && (e.to.startsWith('features/') || e.to.startsWith('layout/'))),
    ).toEqual([]);
  });

  it('lets layout/ use only the notification bell of the features', () => {
    expect(
      broken(
        (e) =>
          e.from.startsWith('layout/') &&
          e.to.startsWith('features/') &&
          e.to !== 'features/notifications/notification-bell',
      ),
    ).toEqual([]);
  });

  it('never lets a role space reach into another feature', () => {
    expect(
      broken((e) => {
        const [top, space] = e.to.split('/');
        return top === 'features' && ROLE_SPACES.has(space!) && area(e.from) !== area(e.to) && !e.from.startsWith('app.');
      }),
    ).toEqual([]);
  });

  it('keeps each feature’s shared/ folder private', () => {
    expect(
      broken((e) => /^features\/[^/]+\/shared\//.test(e.to) && area(e.from) !== area(e.to)),
    ).toEqual([]);
  });
});
