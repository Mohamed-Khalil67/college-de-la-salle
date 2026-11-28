---
name: web-animations
description: Adds and fixes UI animations and micro-interactions using CSS transitions, keyframes, the Web Animations API and View Transitions. Use when the user says animate this, add a transition, hover effect, fade in, slide, loading animation, page transition, micro-interaction, or an animation is janky. Works in any framework.
---

# Web animations (native first)

## 1. Choose the lightest tool
1. CSS `transition` for state changes (hover, focus, open/close).
2. CSS `@keyframes` for looping or multi-step motion.
3. Web Animations API (`element.animate()`) when JavaScript must control timing, pause or reverse.
4. View Transitions API (`document.startViewTransition`, `view-transition-name`, cross-document `@view-transition`) for route or layout changes, where the browser support target allows.
5. An animation library only if the project already uses one. If it does not, ask before adding a dependency. For complex sequencing see the `advanced-animations` skill.

Check the project's existing animation approach and its framework's built-in support (Angular `animate.enter`/`animate.leave` or `@angular/animations`) before writing raw code.

## 2. Rules
- Animate `transform` and `opacity` only. Avoid animating `width`, `height`, `top`, `left`, `margin` or `box-shadow` (they trigger layout or paint); use `transform: scale()`, `translate()` or a grid-rows trick (`grid-template-rows: 0fr` to `1fr`) for expanding sections.
- Durations: 100-200ms for feedback, 200-400ms for entrances and exits. Use ease-out for entering, ease-in for leaving. Define duration and easing as tokens.
- Always handle reduced motion:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
  }
  ```
  Prefer removing movement and keeping opacity or color changes.
- Do not use `will-change` permanently; apply it only for the duration of the animation.
- Animations must not block interaction or hide content from screen readers. Do not convey information by motion alone.
- Stagger lists with a CSS variable index (`--i`) instead of per-item JavaScript.

## 3. Verify
1. Read the project's commands from `package.json`. Do not invent any that are missing.
2. Run the typecheck/build, linter and tests.
3. If a browser tool is available, run the page, trigger the animation and check the console for errors. Record a performance trace if the animation is long or complex, and check for dropped frames. Test once with reduced motion on. Report what was and was not checked.
