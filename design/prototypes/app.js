// Minimal behaviour for the prototypes. Each block maps to one Angular component (see README.md).

// Disclosure: mobile menu (site-header). <button aria-controls="id" aria-expanded>
for (const btn of document.querySelectorAll('[data-disclosure]')) {
  const target = document.getElementById(btn.getAttribute('aria-controls'));
  btn.addEventListener('click', () => {
    const open = btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    target.toggleAttribute('data-open', open);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
      btn.click();
      btn.focus();
    }
  });
}

// Tabs (ARIA tabs pattern, automatic activation, roving tabindex).
for (const list of document.querySelectorAll('[role="tablist"]')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const select = (tab) => {
    for (const t of tabs) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
  };
  list.addEventListener('click', (e) => {
    const tab = e.target.closest('[role="tab"]');
    if (tab) select(tab);
  });
  list.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    select(tab);
    tab.focus();
  });
}

// Password visibility toggle (field).
for (const btn of document.querySelectorAll('[data-toggle-password]')) {
  const input = document.getElementById(btn.getAttribute('aria-controls'));
  btn.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.textContent = show ? 'Masquer' : 'Afficher';
  });
}

// Modal (native <dialog>): showModal() traps focus; Escape closes; focus returns to the opener.
for (const opener of document.querySelectorAll('[data-dialog-open]')) {
  const dialog = document.getElementById(opener.dataset.dialogOpen);
  opener.addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', () => opener.focus());
}
for (const closer of document.querySelectorAll('[data-dialog-close]')) {
  closer.addEventListener('click', () => closer.closest('dialog').close());
}

// Grade entry: validate 0–20 (decimal comma), show the row message, recompute averages.
const gradeTable = document.querySelector('[data-grade-grid]');
if (gradeTable) {
  const parse = (s) => {
    const c = s.trim().replace(',', '.');
    return c === '' || !/^\d+(\.\d+)?$/.test(c) ? NaN : Number(c);
  };
  const fmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const status = document.querySelector('[data-save-status]');
  const update = (row) => {
    const inputs = [...row.querySelectorAll('.grade-input')];
    let sum = 0;
    let weight = 0;
    let invalid = false;
    for (const cell of row.querySelectorAll('[data-grade]')) {
      const coef = Number(cell.dataset.coef || 1);
      sum += Number(cell.dataset.grade) * coef;
      weight += coef;
    }
    for (const input of inputs) {
      if (input.dataset.absent !== undefined) continue;
      const v = parse(input.value);
      const bad = input.value.trim() !== '' && (Number.isNaN(v) || v < 0 || v > 20);
      input.setAttribute('aria-invalid', String(bad));
      invalid ||= bad;
      if (!bad && !Number.isNaN(v)) {
        const coef = Number(input.dataset.coef || 1);
        sum += v * coef;
        weight += coef;
      }
    }
    const msgRow = document.getElementById(row.dataset.errorRow);
    if (msgRow) msgRow.hidden = !invalid;
    const out = row.querySelector('[data-average]');
    if (out) out.textContent = weight ? fmt.format(Math.round((sum / weight) * 10) / 10) : '–';
  };
  for (const row of gradeTable.querySelectorAll('tbody tr[data-error-row]')) update(row);
  gradeTable.addEventListener('input', (e) => {
    const row = e.target.closest('tr');
    if (row) update(row);
    if (status) status.textContent = 'Modifications non enregistrées';
  });
  gradeTable.addEventListener('focusout', () => {
    if (status && !gradeTable.querySelector('[aria-invalid="true"]')) {
      const now = new Date();
      status.textContent = `Enregistré à ${now.getHours()} h ${String(now.getMinutes()).padStart(2, '0')}`;
    }
  });
}

// Attendance: live counts.
const sheet = document.querySelector('[data-attendance]');
if (sheet) {
  const counts = document.querySelectorAll('[data-count]');
  const refresh = () => {
    for (const c of counts) {
      c.textContent = sheet.querySelectorAll(`input[value="${c.dataset.count}"]:checked`).length;
    }
  };
  sheet.addEventListener('change', refresh);
  refresh();
}

// Print button (report card).
for (const btn of document.querySelectorAll('[data-print]')) btn.addEventListener('click', () => window.print());

// Attendance: mark everyone present.
for (const btn of document.querySelectorAll('[data-all-present]')) {
  btn.addEventListener('click', () => {
    const form = btn.closest('form');
    for (const r of form.querySelectorAll('input[type="radio"][value="present"]')) r.checked = true;
    form.dispatchEvent(new Event('change'));
  });
}
