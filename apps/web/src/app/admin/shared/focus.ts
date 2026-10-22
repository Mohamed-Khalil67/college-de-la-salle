/**
 * Moves focus to the page's main heading: a stable place after an action removed the element that had
 * focus (a deleted or archived row, a button that changed into another one). Framework-free.
 */
export function focusPageHeading(doc: Document): void {
  const heading = doc.querySelector<HTMLElement>('main h1');
  if (!heading) return;
  heading.setAttribute('tabindex', '-1');
  heading.focus();
}
