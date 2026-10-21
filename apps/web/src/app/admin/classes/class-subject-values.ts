/**
 * Numbers typed in the « Matières de la classe » table: coefficient and hours per week, written with a
 * decimal comma. No Angular here: unit-tested in class-subject-values.spec.ts.
 */
import type { ClassSubjectDto } from '@cdls/shared';

/** Same limits as the API (class-subject.dto.ts): two decimals at most. */
export const COEFFICIENT_MAX = 20;
export const HOURS_MAX = 40;

/** « 1,5 » or « 1.5 » → 1.5; null when it is not a number. */
export function parseDecimal(text: string): number | null {
  const value = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** 1.5 → « 1,5 »; null → «  ». */
export function formatDecimal(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

export interface DecimalRule {
  readonly noun: string;
  readonly max: number;
  readonly required: boolean;
}

export const COEFFICIENT_RULE: DecimalRule = { noun: 'Le coefficient', max: COEFFICIENT_MAX, required: true };
export const HOURS_RULE: DecimalRule = { noun: 'Le nombre d’heures', max: HOURS_MAX, required: false };

/** What is wrong with a typed number, in French and with the way to fix it, or null. */
export function decimalProblem(text: string, rule: DecimalRule): string | null {
  if (!text.trim()) return rule.required ? `${rule.noun} est obligatoire : saisissez un nombre, par exemple 2 ou 1,5.` : null;
  const value = parseDecimal(text);
  if (value === null) return `${rule.noun} doit être un nombre, par exemple 2 ou 1,5.`;
  if (value > rule.max) return `${rule.noun} ne dépasse pas ${rule.max}.`;
  if (Math.round(value * 100) / 100 !== value) return `${rule.noun} a deux décimales au plus.`;
  return null;
}

export interface ClassSubjectTotals {
  readonly count: number;
  readonly coefficient: number;
  /** null when no subject has hours. */
  readonly hours: number | null;
}

export function classSubjectTotals(rows: readonly Pick<ClassSubjectDto, 'coefficient' | 'hoursPerWeek'>[]): ClassSubjectTotals {
  const withHours = rows.filter((r) => r.hoursPerWeek !== null);
  return {
    count: rows.length,
    coefficient: Math.round(rows.reduce((sum, r) => sum + r.coefficient, 0) * 100) / 100,
    hours: withHours.length ? Math.round(withHours.reduce((sum, r) => sum + (r.hoursPerWeek ?? 0), 0) * 100) / 100 : null,
  };
}

/** What a copy from another class did: subjects added, and subjects whose numbers changed. */
export function copySummary(
  before: readonly ClassSubjectDto[],
  after: readonly ClassSubjectDto[],
): { readonly added: number; readonly updated: number } {
  const known = new Map(before.map((row) => [row.subjectId, row]));
  let added = 0;
  let updated = 0;
  for (const row of after) {
    const old = known.get(row.subjectId);
    if (!old) added += 1;
    else if (old.coefficient !== row.coefficient || old.hoursPerWeek !== row.hoursPerWeek) updated += 1;
  }
  return { added, updated };
}

/** « 3 matières ajoutées, 1 mise à jour » for the notice after a copy. */
export function copyMessage(summary: { readonly added: number; readonly updated: number }, from: string): string {
  const { added, updated } = summary;
  if (!added && !updated) return `La classe a déjà les mêmes matières que ${from} : rien n’a changé.`;
  const parts = [
    added ? `${added} ${added > 1 ? 'matières ajoutées' : 'matière ajoutée'}` : '',
    updated ? `${updated} ${updated > 1 ? 'matières mises à jour' : 'matière mise à jour'}` : '',
  ].filter(Boolean);
  return `Copié depuis ${from} : ${parts.join(', ')}. Les enseignants ne sont pas copiés.`;
}
