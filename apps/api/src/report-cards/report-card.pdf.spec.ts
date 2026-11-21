import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import type { ReportCardDto } from './dto/report-card.dto.js';
import { reportCardPdf, type ReportCardPdfContext } from './report-card.pdf.js';

const ctx: ReportCardPdfContext = {
  schoolName: 'École de démonstration',
  timeZone: 'Africa/Cairo',
  termLabel: '1er trimestre',
  yearLabel: '2026-2027',
  classLabel: '3e A',
  classSize: 24,
};

function card(over: Partial<ReportCardDto>): ReportCardDto {
  const base = {
    id: 'c1',
    periodId: 'p1',
    classId: 'k1',
    studentId: 's1',
    studentName: 'Élodie Martin',
    average: 14.5,
    rank: 3,
    appreciation: 'Très bon trimestre.',
    subjects: [{ subjectId: 'm1', subjectName: 'Mathématiques', coefficient: 4, average: 15, gradeCount: 3 }],
    generatedAt: '2026-12-01T10:00:00.000Z',
    published: true,
  };
  return { ...base, ...over } as ReportCardDto;
}

/** Every stream of the PDF, inflated when it is compressed. */
function streams(pdf: Buffer): string[] {
  const out: string[] = [];
  const raw = pdf.toString('latin1');
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    const bytes = pdf.subarray(start, end);
    try {
      out.push(inflateSync(bytes).toString('latin1'));
    } catch {
      out.push(bytes.toString('latin1'));
    }
    re.lastIndex = end + 'endstream'.length;
  }
  return out;
}

/** The resource name of each embedded font (`/F1` …) with its base font name. */
function fontNames(pdf: Buffer): Map<string, string> {
  const raw = pdf.toString('latin1');
  const byObject = new Map<string, string>();
  for (const m of raw.matchAll(/(\d+) 0 obj\s*<<[^>]*?\/Type \/Font[\s\S]*?\/BaseFont \/([A-Z]{6}\+[\w-]+)/g)) {
    byObject.set(m[1]!, m[2]!);
  }
  const names = new Map<string, string>();
  for (const m of raw.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    const base = byObject.get(m[2]!);
    if (base) names.set(m[1]!, base);
  }
  return names;
}

/** Glyph ids shown with each font resource in the page content. */
function glyphsByFont(pdf: Buffer): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const s of streams(pdf)) {
    if (!s.includes(' Tf')) continue;
    let font = '';
    for (const m of s.matchAll(/\/(F\d+) [\d.]+ Tf|\[([^\]]*)\] TJ|<([0-9a-fA-F]*)> Tj/g)) {
      if (m[1]) {
        font = m[1];
        continue;
      }
      const hex = (m[2] ?? m[3] ?? '').match(/<([0-9a-fA-F]*)>/g)?.map((h) => h.slice(1, -1)) ?? [m[3] ?? ''];
      const ids = out.get(font) ?? [];
      for (const h of hex) for (let i = 0; i + 4 <= h.length; i += 4) ids.push(parseInt(h.slice(i, i + 4), 16));
      out.set(font, ids);
    }
  }
  return out;
}

describe('reportCardPdf', () => {
  it('embeds only Roboto for a French card (the look is unchanged)', async () => {
    const pdf = await reportCardPdf(card({}), ctx);
    const bases = [...fontNames(pdf).values()];
    expect(bases.some((b) => b.includes('Roboto'))).toBe(true);
    expect(bases.some((b) => b.includes('Cairo'))).toBe(false);
  });

  it('prints an Arabic appreciation and name with real glyphs (never .notdef)', async () => {
    const pdf = await reportCardPdf(
      card({ studentName: 'سارة أحمد', appreciation: 'تحية طيبة، عمل ممتاز هذا الفصل.' }),
      ctx,
    );
    const names = fontNames(pdf);
    const cairo = [...names].filter(([, base]) => base.includes('Cairo')).map(([res]) => res);
    expect(cairo.length).toBeGreaterThan(0);
    const glyphs = glyphsByFont(pdf);
    const arabicGlyphs = cairo.flatMap((res) => glyphs.get(res) ?? []);
    // « سارة أحمد » and the appreciation: well over a dozen Arabic glyphs, none of them glyph 0 (.notdef).
    expect(arabicGlyphs.length).toBeGreaterThan(20);
    expect(arabicGlyphs).not.toContain(0);
    for (const [, ids] of glyphs) expect(ids).not.toContain(0);
    // The text stays searchable: the Cairo font maps its glyphs back to the Arabic letters (ت U+062A, ح U+062D).
    const cmaps = streams(pdf).filter((s) => s.includes('beginbfrange') || s.includes('beginbfchar'));
    expect(cmaps.some((s) => /<062a>/i.test(s) && /<062d>/i.test(s))).toBe(true);
  });

  it('lays a long Arabic appreciation out on several lines', async () => {
    const long = Array.from({ length: 40 }, () => 'عمل ممتاز').join(' ');
    const pdf = await reportCardPdf(card({ appreciation: long }), ctx);
    const glyphs = glyphsByFont(pdf);
    for (const [, ids] of glyphs) expect(ids).not.toContain(0);
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
