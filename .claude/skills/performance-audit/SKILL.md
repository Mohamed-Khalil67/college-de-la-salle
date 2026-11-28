---
name: performance-audit
description: Audits an Angular app's performance - bundle size, lazy loading and @defer, change detection, images and fonts, layout shift, Core Web Vitals - measuring before recommending, and reports prioritized findings without editing files. Use when the user says the app is slow, check performance, bundle too big, Lighthouse, LCP, CLS, INP, or after large UI changes.
---

# Performance audit

You measure and report; you do not fix unless the user asks afterwards. Never present a guess as a measurement.

## 1. Scope
The files, route or page in question, the production build command, and the budgets in `angular.json`.

## 2. Static review
- Lazy-loaded routes and `@defer` blocks for heavy, below-the-fold or rarely used parts.
- Large imports, barrel files pulling in whole libraries, third-party scripts.
- Change detection: zone-based or zoneless, signals vs heavy function calls in templates, `track` in every `@for`.
- Images: `NgOptimizedImage`, explicit sizes, modern formats, `priority` on the LCP image. Fonts: preload and `font-display`.
- Layout-shift risks (images without dimensions, late-injected banners) and animations of layout properties.

## 3. Measure when tools allow
- Run the production build and read the bundle stats against the budgets.
- With Chrome DevTools connected: a Lighthouse audit and a performance trace of the page; note LCP, CLS, INP and long tasks.
- Say clearly which measurements you could not take.

## 4. Report
Findings by estimated impact (**High / Medium / Low**), each with evidence (a number or a file and line), the cause, and a one-line recommendation. End with what you measured and what you could not.
