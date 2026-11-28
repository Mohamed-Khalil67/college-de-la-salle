---
name: advanced-animations
description: Builds complex, high-end animations - scroll-driven effects, parallax, pinned sections, sequenced timelines, FLIP and shared-element transitions, SVG path and morph effects, text splitting, canvas and WebGL. Use when the user says scroll animation, scrollytelling, parallax, timeline, stagger sequence, complex animation, awwwards-style, morph, SVG animation, 3D, or a library like Motion. Works in any framework.
---

# Advanced animations

For simple hover, fade and slide effects use `web-animations` instead.

## 1. Pick the technique
| Need | First choice | Fallback |
|---|---|---|
| Effect tied to scroll position | CSS scroll-driven animations (`animation-timeline: scroll()` / `view()`) where the browser target allows | `IntersectionObserver` plus the project's animation library |
| Multi-step sequence with precise timing | Web Animations API with `finished` promises, or the project's animation library | CSS `animation-delay` chains |
| Layout change animated smoothly | FLIP (First, Last, Invert, Play) or View Transitions | Library layout animation |
| SVG line draw / morph | `stroke-dashoffset`, CSS `offset-path` | SMIL is deprecated-in-practice; avoid |
| Particles, shaders, 3D | Canvas 2D, then WebGL (Three.js, OGL) | - |

## 2. Libraries
- Use the library the project already has. If none exists, **ask before adding one** and say why (bundle size, licence, framework fit).
- If the project's animation library publishes its own agent skill or docs (Motion does, via `npx motion-ai`), read those before coding.
- Clean up in framework lifecycles: cancel animations, observers and RAF loops on destroy (Angular `DestroyRef`).
- Run animation code outside Angular's zone (`NgZone.runOutsideAngular`) when the project is zone-based, to avoid change-detection on every frame.

## 3. Rules
- Same baseline as `web-animations`: animate `transform` and `opacity`, handle `prefers-reduced-motion` (disable parallax, pinning and autoplay; keep content readable and reachable).
- Never hijack native scroll speed or break keyboard, anchor, or screen-reader navigation. Pinned sections need a non-animated fallback.
- Create scroll-linked effects after layout is stable (fonts and images loaded) and recompute on resize. Prefer `IntersectionObserver` for simple reveal-on-scroll.
- Keep the main thread free: no layout reads and writes interleaved in a loop; batch them. Cap canvas resolution to `devicePixelRatio <= 2`.
- Pause or destroy offscreen animations. Lazy-load heavy libraries and 3D assets.
- Avoid layout shift: reserve space for animated elements.

## 4. Verify
1. Read the project's commands from `package.json`. Do not invent any that are missing.
2. Run the typecheck/build, linter and tests.
3. With a browser tool, run the page and scroll through the whole effect, then check console errors, record a performance trace (look for long frames, layout thrash, memory growth after navigating away and back), and test with reduced motion on and at a mobile width. Report what was and was not checked.

Deeper recipes: see `references/recipes.md`.
