import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pdfmake from 'pdfmake';
import type { ReportCardDto } from './dto/report-card.dto.js';
import { hasArabic, visualRuns, wrapParagraph, type Direction, type TextRun } from './pdf-text.js';

const require = createRequire(import.meta.url);
type FontDescriptors = Parameters<typeof pdfmake.setFonts>[0];
const roboto = require('pdfmake/fonts/Roboto.js') as FontDescriptors;
const fontDir = dirname(require.resolve('pdfmake/fonts/Roboto.js'));
/** Cairo (SIL OFL 1.1, Arabic block only, from @fontsource/cairo; licence next to it): committed, never fetched. */
const assetDir = fileURLToPath(new URL('../../assets/fonts/', import.meta.url));
const cairo = {
  normal: `${assetDir}Cairo-Arabic-Regular.woff`,
  bold: `${assetDir}Cairo-Arabic-Bold.woff`,
  italics: `${assetDir}Cairo-Arabic-Regular.woff`,
  bolditalics: `${assetDir}Cairo-Arabic-Bold.woff`,
};

pdfmake.setFonts({ ...roboto, Cairo: cairo });
// No network, and only the bundled and committed fonts from disk.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => path.startsWith(fontDir) || path.startsWith(assetDir));

/** The few fontkit calls used to measure a line (fontkit ships no types; it is the engine pdfkit embeds with). */
interface MeasuredFont {
  readonly unitsPerEm: number;
  layout(text: string): { readonly advanceWidth: number };
}
const fontkit = require('fontkit') as { openSync(path: string): MeasuredFont };
const robotoRegular = roboto['Roboto']?.normal;
let measureFonts: { latin: MeasuredFont; arabic: MeasuredFont } | undefined;
function fonts(): { latin: MeasuredFont; arabic: MeasuredFont } {
  if (!measureFonts) {
    if (typeof robotoRegular !== 'string') throw new Error('Roboto introuvable');
    measureFonts = { latin: fontkit.openSync(robotoRegular), arabic: fontkit.openSync(cairo.normal) };
  }
  return measureFonts;
}

export interface ReportCardPdfContext {
  readonly schoolName: string;
  /** The school's IANA zone (profile), for the « Édité le » date. */
  readonly timeZone: string;
  readonly termLabel: string;
  readonly yearLabel: string;
  readonly classLabel: string;
  readonly classSize: number;
}

const PAGE_WIDTH = 595.28; // A4
const MARGIN_X = 48;
const BODY_SIZE = 10;

const fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const mark = (n: number | null) => (n === null ? '—' : fmt.format(n));

interface Inline {
  readonly text: string;
  readonly font?: string;
  readonly noWrap: true;
}

function inlines(runs: readonly TextRun[]): Inline[] {
  return runs.map((r) => (r.arabic ? { text: r.text, font: 'Cairo', noWrap: true } : { text: r.text, noWrap: true }));
}

/**
 * A short text (a name, a label) as pdfmake text: unchanged when it has no Arabic, else visual runs, each set in
 * the font that has its glyphs. Isolated: its order never mixes with the French around it.
 */
export function rich(text: string): Array<string | Inline> {
  return hasArabic(text) ? inlines(visualRuns(text)) : [text];
}

function width(runs: readonly TextRun[], fontSize: number): number {
  const { latin, arabic } = fonts();
  return runs.reduce((sum, r) => {
    const font = r.arabic ? arabic : latin;
    return sum + (font.layout(r.text).advanceWidth / font.unitsPerEm) * fontSize;
  }, 0);
}

/** A paragraph: pdfmake's own wrapping when it has no Arabic; lines broken here and aligned to its side otherwise. */
function paragraph(text: string, maxWidth: number, fontSize: number) {
  if (!hasArabic(text)) return { text };
  const { dir, lines } = wrapParagraph(text, maxWidth, (runs) => width(runs, fontSize));
  return { stack: lines.map((line) => ({ text: inlines(line), alignment: side(dir) })) };
}

const side = (dir: Direction) => (dir === 'rtl' ? 'right' : 'left');

/** The report card as a one-page A4 PDF. */
export function reportCardPdf(card: ReportCardDto, ctx: ReportCardPdfContext): Promise<Buffer> {
  const bodyWidth = PAGE_WIDTH - 2 * MARGIN_X - 2;
  const doc = {
    pageSize: 'A4',
    pageMargins: [MARGIN_X, 56, MARGIN_X, 56],
    info: { title: `Bulletin — ${card.studentName} — ${ctx.termLabel}`, author: ctx.schoolName },
    defaultStyle: { font: 'Roboto', fontSize: BODY_SIZE, color: '#1f2937' },
    content: [
      { text: rich(ctx.schoolName), style: 'school' },
      {
        text: ['Bulletin scolaire — ', ...rich(ctx.termLabel), ' ', ...rich(ctx.yearLabel)],
        style: 'title',
      },
      {
        columns: [
          { text: [{ text: 'Élève : ', bold: true }, ...rich(card.studentName)] },
          { text: [{ text: 'Classe : ', bold: true }, ...rich(ctx.classLabel)], alignment: 'right' },
        ],
        margin: [0, 8, 0, 16],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', 50, 80, 50],
          body: [
            [
              { text: 'Matière', style: 'th' },
              { text: 'Coef.', style: 'th', alignment: 'center' },
              { text: 'Moyenne /20', style: 'th', alignment: 'center' },
              { text: 'Notes', style: 'th', alignment: 'center' },
            ],
            ...card.subjects.map((s) => [
              hasArabic(s.subjectName) ? { text: rich(s.subjectName) } : s.subjectName,
              { text: fmt.format(s.coefficient), alignment: 'center' },
              { text: mark(s.average), alignment: 'center' },
              { text: String(s.gradeCount), alignment: 'center' },
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        margin: [0, 16, 0, 0],
        columns: [
          { text: [{ text: 'Moyenne générale : ', bold: true }, `${mark(card.average)} / 20`] },
          {
            text: [
              { text: 'Rang : ', bold: true },
              card.rank === null ? '—' : `${card.rank} / ${ctx.classSize}`,
            ],
            alignment: 'right',
          },
        ],
      },
      { text: 'Appréciation', style: 'h2' },
      card.appreciation
        ? paragraph(card.appreciation, bodyWidth, BODY_SIZE)
        : { text: '—', italics: true },
      {
        text: `Édité le ${new Date(card.generatedAt).toLocaleDateString('fr-FR', { timeZone: ctx.timeZone })}`,
        style: 'small',
      },
    ],
    styles: {
      school: { fontSize: 9, color: '#6b7280', characterSpacing: 1 },
      title: { fontSize: 16, bold: true, margin: [0, 4, 0, 0], color: '#14213d' },
      th: { bold: true, fillColor: '#f3f4f6' },
      h2: { fontSize: 12, bold: true, margin: [0, 20, 0, 6], color: '#14213d' },
      small: { fontSize: 8, color: '#6b7280', margin: [0, 32, 0, 0] },
    },
  };
  return pdfmake.createPdf(doc).getBuffer();
}
