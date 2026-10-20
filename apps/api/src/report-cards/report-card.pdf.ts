import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import pdfmake from 'pdfmake';
import type { ReportCardDto } from './dto/report-card.dto.js';

const require = createRequire(import.meta.url);
const fonts = require('pdfmake/fonts/Roboto.js') as Parameters<typeof pdfmake.setFonts>[0];
const fontDir = dirname(require.resolve('pdfmake/fonts/Roboto.js'));

pdfmake.setFonts(fonts);
// No network, and only the bundled fonts from disk.
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((path) => path.startsWith(fontDir));

export interface ReportCardPdfContext {
  readonly schoolName: string;
  readonly termLabel: string;
  readonly yearLabel: string;
  readonly classLabel: string;
  readonly classSize: number;
}

const fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const mark = (n: number | null) => (n === null ? '—' : fmt.format(n));

/** The report card as a one-page A4 PDF. */
export function reportCardPdf(card: ReportCardDto, ctx: ReportCardPdfContext): Promise<Buffer> {
  const doc = {
    pageSize: 'A4',
    pageMargins: [48, 56, 48, 56],
    info: { title: `Bulletin — ${card.studentName} — ${ctx.termLabel}`, author: ctx.schoolName },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1f2937' },
    content: [
      { text: ctx.schoolName, style: 'school' },
      { text: `Bulletin scolaire — ${ctx.termLabel} ${ctx.yearLabel}`, style: 'title' },
      {
        columns: [
          { text: [{ text: 'Élève : ', bold: true }, card.studentName] },
          { text: [{ text: 'Classe : ', bold: true }, ctx.classLabel], alignment: 'right' },
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
              s.subjectName,
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
      { text: card.appreciation || '—', italics: !card.appreciation },
      {
        text: `Édité le ${new Date(card.generatedAt).toLocaleDateString('fr-FR', { timeZone: 'Africa/Cairo' })}`,
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
