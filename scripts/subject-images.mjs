// Generates one illustration per subject: public/images/matieres/<id>.svg (600×400).
//
//   node scripts/subject-images.mjs
//
// Flat navy background, antique-gold line art, cream accents: the school's palette. They are
// original drawings (no licence to track). To use a real photograph for a subject instead, drop a
// JPEG next to them and change `image` in libs/site-content/src/lib/matieres.ts.
import { mkdirSync, writeFileSync } from 'node:fs';

const GOLD = '#C5A880';
const CREAM = '#F5EBE0';
const line = `fill="none" stroke="${GOLD}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"`;
const soft = `fill="${CREAM}" fill-opacity=".14" stroke="${GOLD}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"`;

const book = `<path ${soft} d="M300 150C255 128 205 128 150 145V285C205 268 255 268 300 290Z"/><path ${soft} d="M300 150C345 128 395 128 450 145V285C395 268 345 268 300 290Z"/><path ${line} d="M300 150V290"/>`;
const glyph = (d) => `<path ${line} stroke="${CREAM}" stroke-width="11" d="${d}"/>`;

const art = {
  arabe: `${book}<path ${line} d="M190 105C240 60 340 60 410 100"/><path ${line} stroke="${CREAM}" d="M200 220C230 190 262 236 290 205"/><path ${line} stroke="${CREAM}" d="M330 205C360 175 392 221 420 190"/>`,
  francais: `${book}${glyph('M355 200V252M355 200H395M355 224H385')}<path ${line} d="M205 112L222 98"/>`,
  anglais: `${book}${glyph('M335 252L360 192L385 252M344 232H376')}<path ${line} d="M205 112H235"/>`,
  espagnol: `${book}${glyph('M342 252V196L388 252V196')}<path ${line} d="M346 176Q358 166 370 176T394 176"/>`,
  mathematiques: `<path ${line} d="M130 310H480M160 335V80"/><path ${line} stroke="${CREAM}" d="M180 290Q300 -10 430 290"/><path ${soft} d="M360 310V210L440 310Z"/><path ${line} d="M175 130H215M175 200H215"/>`,
  'physique-chimie': `<g transform="translate(225 200)"><circle r="14" fill="${CREAM}"/><ellipse ${line} rx="100" ry="34"/><ellipse ${line} rx="100" ry="34" transform="rotate(60)"/><ellipse ${line} rx="100" ry="34" transform="rotate(120)"/></g><path ${soft} d="M410 110H455M420 110V190L385 285H480L445 190V110"/><path ${line} d="M398 250H467"/>`,
  svt: `<path ${soft} d="M175 300C160 160 270 95 425 105C435 240 345 320 175 300Z"/><path ${line} stroke="${CREAM}" d="M175 300L385 145M270 232L270 175M320 195L368 195M240 262L192 258"/>`,
  informatique: `<rect ${soft} x="140" y="105" width="320" height="195" rx="16"/><path ${line} d="M300 300V335M230 340H370"/><path ${line} stroke="${CREAM}" d="M250 175L215 205L250 235M350 175L385 205L350 235M318 168L282 242"/>`,
  ses: `<path ${line} d="M130 310H470M150 330V90"/><rect ${soft} x="190" y="210" width="50" height="100"/><rect ${soft} x="270" y="160" width="50" height="150"/><rect ${soft} x="350" y="110" width="50" height="200"/><circle ${soft} cx="440" cy="130" r="38"/><path ${line} stroke="${CREAM}" d="M440 112V148M428 124Q440 112 452 124"/>`,
  'histoire-geographie': `<circle ${soft} cx="225" cy="200" r="95"/><ellipse ${line} cx="225" cy="200" rx="40" ry="95"/><path ${line} d="M130 200H320M150 145H300M150 255H300"/><path ${soft} d="M385 175L440 130L495 175Z"/><path ${line} d="M395 190V280M440 190V280M485 190V280M380 290H500"/>`,
  philosophie: `<circle ${soft} cx="300" cy="160" r="70"/><path ${line} d="M270 230V262H330V230M276 290H324"/><path ${line} stroke="${CREAM}" d="M278 160Q300 120 322 160T300 196"/><path ${line} d="M300 60V40M205 95L188 80M395 95L412 80M185 160H160M415 160H440"/>`,
  'education-civique': `<path ${line} d="M300 90V310M220 310H380M300 110H180M300 110H420"/><path ${soft} d="M180 110L140 205H220ZM420 110L380 205H460Z"/><path ${line} d="M140 205Q180 240 220 205M380 205Q420 240 460 205"/><circle cx="300" cy="90" r="12" fill="${CREAM}"/>`,
  'education-religieuse': `<path ${soft} d="M225 120A85 85 0 1 0 225 290A66 66 0 1 1 225 120Z"/><path ${line} stroke="${CREAM}" d="M420 120V280M375 175H465"/><path ${line} d="M262 205l14 -10l14 10l-6 -16l14 -10h-17l-5 -17l-5 17h-17l14 10z" transform="translate(-40 -2)"/>`,
  eps: `<circle ${soft} cx="300" cy="200" r="105"/><path ${line} d="M195 200H405M300 95V305"/><path ${line} d="M222 125Q280 200 222 275M378 125Q320 200 378 275"/>`,
  arts: `<path ${soft} d="M300 100C190 100 130 175 150 245C165 295 225 305 255 285C285 265 300 295 340 305C400 320 470 270 470 205C470 140 410 100 300 100Z"/><circle cx="225" cy="160" r="16" fill="${CREAM}"/><circle cx="300" cy="135" r="16" fill="${CREAM}"/><circle cx="375" cy="160" r="16" fill="${CREAM}"/><circle cx="195" cy="225" r="16" fill="${CREAM}"/><path ${line} stroke="${CREAM}" d="M430 90L350 230"/>`,
  psychologie: `<path ${soft} d="M215 310V260C160 245 150 165 200 125C255 85 345 100 370 160C388 202 366 236 340 248V310Z"/><path ${line} stroke="${CREAM}" d="M250 175Q275 140 305 170T335 190M240 215Q270 195 295 222"/><circle ${line} cx="410" cy="120" r="22"/><path ${line} d="M432 142L460 170"/>`,
  humanites: `<path ${soft} d="M180 120H430V300H180Z"/><path ${line} d="M180 120C150 120 150 160 180 160M430 300C460 300 460 260 430 260"/><path ${line} stroke="${CREAM}" d="M215 170H395M215 205H395M215 240H340"/>`,
};

/** Keeps the last value of an attribute repeated on one element (a later `stroke=` overrides the default), as XML requires. */
const dedupe = (markup) =>
  markup.replace(/<([a-zA-Z]+)((?:\s+[a-zA-Z:-]+="[^"]*")+)\s*(\/?)>/g, (_, tag, attrs, close) => {
    const last = new Map();
    for (const [, name, value] of attrs.matchAll(/\s+([a-zA-Z:-]+)="([^"]*)"/g)) last.set(name, value);
    return `<${tag}${[...last].map(([n, v]) => ` ${n}="${v}"`).join('')}${close}>`;
  });

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="600" height="400" role="img">` +
  `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0A192F"/><stop offset="1" stop-color="#0F2C59"/></linearGradient></defs>` +
  `<rect width="600" height="400" fill="url(#g)"/>` +
  `<circle cx="300" cy="200" r="168" fill="none" stroke="${GOLD}" stroke-opacity=".25" stroke-width="2"/>` +
  `${body}</svg>\n`;

mkdirSync('public/images/matieres', { recursive: true });
for (const [id, body] of Object.entries(art)) writeFileSync(`public/images/matieres/${id}.svg`, dedupe(svg(body)));
console.log(`${Object.keys(art).length} illustrations → public/images/matieres/`);
