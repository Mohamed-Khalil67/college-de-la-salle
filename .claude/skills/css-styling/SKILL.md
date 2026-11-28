---
name: css-styling
description: Writes and fixes CSS/SCSS for layout, responsive design, spacing, typography, theming and dark mode using modern CSS. Use when the user says style this, fix the layout, make it responsive, center this, align, spacing, grid, flexbox, dark mode, theme, design tokens, or CSS is broken. Works in any framework.
---

# CSS styling

## 1. Read before writing
- Find the project's styling system first: global stylesheet, SCSS variables or CSS custom properties, any utility framework (Tailwind, Bootstrap), and the component library in use.
- Reuse existing tokens (colors, spacing, radius, font families) and existing classes. Add a new token only when none fits, and put it where the others live.
- Check how component styles are scoped (Angular view encapsulation, global vs component styles). Global frameworks such as Bootstrap can collide with generic class names like `row` or `btn`, so use component-specific names.

## 2. Defaults to apply
- Layout: Grid for two-dimensional layout, Flexbox for one-dimensional. Use `gap`, not margins between siblings.
- Responsive: mobile first. Prefer container queries (`@container`) for components and media queries for page-level changes. Use `clamp()` for fluid type and spacing.
- Units: `rem` for type and spacing, `%`/`fr`/`dvh` for layout. Use `dvh`/`svh` instead of `vh` for full-height mobile layouts.
- Logical properties (`margin-inline`, `padding-block`, `inset`) so RTL works without rewrites.
- Theming: custom properties on `:root`, overridden under a theme selector or `@media (prefers-color-scheme: dark)`. Use `color-scheme` and `light-dark()` where the browser support target allows.
- Modern selectors where support allows: `:has()`, `:is()`, `:where()`, native nesting, `@layer` for controlling cascade order. Check the project's browser support target before using anything newer.
- Avoid `!important`, fixed pixel heights on text containers and overly specific selectors. Fix cascade problems with `@layer` or lower specificity, not with more specificity.
- Do not use `z-index` without checking the stacking context; define z-index values as tokens.

## 3. Accessibility checks while styling
- Text contrast at least 4.5:1 (3:1 for large text and UI borders).
- Visible `:focus-visible` outline on every interactive element. Never remove outlines without a replacement.
- Touch targets at least 24x24 CSS px (44x44 preferred on touch UIs).
- Respect `prefers-reduced-motion` for anything that moves.

## 4. Verify
1. Read the project's commands from `package.json` (and its lockfile to pick npm, pnpm or yarn). Do not invent commands; if a check does not exist, say so.
2. Run the typecheck/build, the linter (stylelint if present) and the tests.
3. If a dev server and a browser tool are available, load the page and check 320px, 768px and 1280px widths, light and dark mode, and keyboard focus. Report what was checked and what was not.
