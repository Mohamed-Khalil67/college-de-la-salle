import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `typescript/no-non-null-assertion` (apps/web/.oxlintrc.json) checks the TypeScript of the app, but not
 * the templates, which oxlint reads as strings. This finds `value!` in inline templates and .html files:
 * narrow with `@if (value(); as v)` or `?.` instead.
 */
const APP = dirname(fileURLToPath(import.meta.url));

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return (path.endsWith('.ts') && !path.endsWith('.spec.ts')) || path.endsWith('.html') ? [path] : [];
  });
}

/** The template text of a file: the whole .html file, or every inline `template: \`…\`` of a .ts file. */
function templates(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.html')) return [text];
  return [...text.matchAll(/template:\s*`([\s\S]*?)`/g)].map((m) => m[1] ?? '');
}

/** An identifier, `)` or `]` followed by `!` that is not `!=`. */
const NON_NULL = /[\w)\]]!(?!=)/g;

describe('templates', () => {
  it('use no non-null assertion', () => {
    const found = files(APP).flatMap((path) =>
      templates(path).flatMap((template) =>
        [...template.matchAll(NON_NULL)]
          // Text such as « Bravo ! » or "Attention!" is content, not an expression: only check inside {{ }}, [x]="", (x)="" and @-blocks.
          .filter((m) => inExpression(template, m.index))
          .map((m) => `${relative(APP, path).split(sep).join('/')}: ${template.slice(Math.max(0, m.index - 30), m.index + 2).trim()}`),
      ),
    );
    expect(found).toEqual([]);
  });
});

/** Is position `at` inside a template expression ({{ … }}, a bound attribute's value, or an @-block's condition)? */
function inExpression(template: string, at: number): boolean {
  const before = template.slice(0, at);
  const interpolation = before.lastIndexOf('{{') > before.lastIndexOf('}}');
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const bound = /[[(][\w.\-[\]()]*[\])]="[^"]*$/.test(line) || /\*\w+="[^"]*$/.test(line);
  const block = /@(if|for|switch|case|else if|let|defer)\b[^{]*$/.test(line);
  return interpolation || bound || block;
}
