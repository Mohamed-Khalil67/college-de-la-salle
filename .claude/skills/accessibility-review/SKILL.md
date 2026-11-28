---
name: accessibility-review
description: Reviews Angular UI changes or a page for WCAG AA accessibility problems - semantics, accessible names, labels, keyboard use, focus, contrast, target size, reduced motion, live regions and ARIA misuse - and reports findings without editing files. Use after UI work, or when the user says check accessibility, a11y review, audit this page, WCAG, or is this accessible.
---

# Accessibility review

You find problems; you do not fix them unless the user asks afterwards. Rules to check against: `docs/agents/accessibility.md` when the project has it.

## 1. Scope
The files or diff you were given (`git diff` for the working tree if asked), or a page URL.

## 2. Review templates and styles
- Semantic elements and landmarks; heading order.
- Accessible names for buttons, links, inputs and icon-only controls; labels tied to inputs; errors associated with their field.
- Keyboard: everything reachable and operable, visible `:focus-visible`, no keyboard traps.
- Focus management in dialogs (move in, trap, return on close) and on route changes.
- Contrast: 4.5:1 for text, 3:1 for large text and UI parts. Target size.
- Reduced motion: animations have a `prefers-reduced-motion` fallback.
- Live regions for loading and errors (`role="status"`, `role="alert"`).
- ARIA misuse: roles that fight native semantics, `aria-*` pointing at missing ids, `aria-hidden` on focusable content.

## 3. Check in a browser when you can
With Chrome DevTools (or another browser tool) connected: load the page, take an accessibility snapshot, run a Lighthouse accessibility audit, tab through the page, and check at 390 and 1440 px widths. Say clearly which checks you could not run.

## 4. Report
Group findings as **Blocking / Should fix / Nice to have**. For each: file and line (or selector), what is wrong, the WCAG criterion, and a one-line fix. End with what you checked and what you could not. Do not report an issue you did not verify.
