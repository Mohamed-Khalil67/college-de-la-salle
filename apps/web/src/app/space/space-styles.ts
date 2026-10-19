/** Form and button styles shared by the school-space components (component CSS beats Tailwind utilities). */
export const SPACE_STYLES = `
  :host { display: block; }
  /* Grid items may shrink below their content (long option labels, wide tables) instead of widening the page. */
  .grid > *, .flex > * { min-inline-size: 0; }
  .tab { padding: 0.55rem 1rem; border-radius: 999px; border: 0; background: transparent; font: inherit; font-weight: 600; color: var(--navy-700); cursor: pointer; }
  .tab[aria-selected='true'] { background: var(--navy-900); color: var(--cream); }
  .choice { padding: 0.65rem 0.8rem; border-radius: 10px; border: 1px solid var(--border); background: var(--surface); font: inherit; font-weight: 600; color: var(--navy-900); cursor: pointer; }
  .choice[aria-checked='true'] { border-color: var(--navy-700); background: var(--navy-100); box-shadow: inset 0 0 0 1px var(--navy-700); }
  input, select, textarea { font: inherit; padding: 0.6rem 0.75rem; border: 1px solid var(--border); border-radius: 10px; background: #fff; color: inherit; max-inline-size: 100%; }
  textarea { min-block-size: 7rem; resize: vertical; }
  input[aria-invalid='true'], textarea[aria-invalid='true'] { border-color: #a12a1f; }
  .err { margin: 0; min-block-size: 1.3em; color: #a12a1f; font-size: 0.9rem; }
  .btn-navy { background: var(--navy-900); color: var(--cream); cursor: pointer; font: inherit; font-weight: 600; }
  .btn-navy:hover:not(:disabled) { background: var(--navy-700); }
  .btn-navy:disabled { opacity: 0.6; cursor: wait; }
  .btn-outline-dark { border-color: var(--navy-700); color: var(--navy-700); background: transparent; cursor: pointer; font: inherit; font-weight: 600; }
  .btn-outline-dark:hover { background: var(--navy-100); }
  .link { background: none; border: 0; padding: 0; font: inherit; color: var(--navy-700); text-decoration: underline; cursor: pointer; }
`;

/**
 * One colour per event category (dark text on a light tint: AA contrast). Always shown with the category's
 * name too, never colour alone.
 */
export const KIND_STYLES = `
  .k-cours { background: #e6eefb; color: #1d3f7a; border-color: #1d3f7a; }
  .k-td { background: #ece6f8; color: #4a2f86; border-color: #4a2f86; }
  .k-tp { background: #def2ee; color: #145a4f; border-color: #145a4f; }
  .k-examen { background: #fbe3e1; color: #8a1f17; border-color: #8a1f17; }
  .k-controle { background: #fdecda; color: #84450b; border-color: #84450b; }
  .k-devoir { background: #f6ebcf; color: #6e470d; border-color: #6e470d; }
  .k-revision { background: #e3efdf; color: #24552d; border-color: #24552d; }
  .k-activite { background: #fbe5ef; color: #86204f; border-color: #86204f; }
  .k-reunion { background: #eceff3; color: #39465a; border-color: #39465a; }
`;
