# Advanced animation recipes

Load only the section you need. Check that APIs are supported by the project's browser target and library version before using them.

## CSS scroll-driven reveal
```css
@supports (animation-timeline: view()) {
  .reveal {
    animation: reveal linear both;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }
  @keyframes reveal { from { opacity: 0; transform: translateY(2rem); } to { opacity: 1; transform: none; } }
}
@media (prefers-reduced-motion: reduce) { .reveal { animation: none; } }
```
Outside `@supports`, fall back to `IntersectionObserver` toggling a class.

## Reading progress bar
`animation-timeline: scroll(root)` on a `transform: scaleX()` element, with `transform-origin: left`.

## FLIP (layout animation)
1. Read the element's `getBoundingClientRect()` (First).
2. Apply the change, read it again (Last).
3. Set `transform: translate(dx, dy) scale(sx, sy)` to invert, then animate to `none` with `element.animate()` (Play).
Read all rects before writing any styles.

## Sequenced timeline (Web Animations API)
```ts
const opts = { duration: 600, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', fill: 'both' } as const;
const from = (y: number) => [{ opacity: 0, transform: `translateY(${y}px)` }, { opacity: 1, transform: 'none' }];
const anims = [
  title.animate(from(40), opts),
  sub.animate(from(24), { ...opts, delay: 300 }),
  cta.animate(from(24), { ...opts, delay: 600 }),
];
// on destroy: anims.forEach((a) => a.cancel());
```
Skip or shorten the sequence when `matchMedia('(prefers-reduced-motion: reduce)').matches`.

## Pinned section
Prefer `position: sticky` inside a tall wrapper, driven by a scroll-driven animation. Pin only when the content is shorter than the viewport, and skip pinning for reduced motion and small screens.

## SVG line draw
Set `pathLength="1"`, `stroke-dasharray: 1`, animate `stroke-dashoffset` from `1` to `0`.

## Canvas loop
Use `requestAnimationFrame`, a delta-time step, cancel on destroy, pause with `IntersectionObserver` and `document.visibilityState`, and size the canvas to CSS size times `min(devicePixelRatio, 2)`.

## Debugging checklist
- Jank: record a Performance trace; look for Layout and Recalculate Style inside the animation frames.
- Jumps on load: fonts or images changed layout after triggers were created; refresh triggers.
- Leaks: navigate away and back three times; heap and listener counts must not grow.
