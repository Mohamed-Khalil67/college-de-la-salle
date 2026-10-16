/**
 * Tiny blurred stand-in shown by NgOptimizedImage while the real image loads (a flat navy wash,
 * well under the 4 kB data-URL limit). Combined with fixed aspect-ratio containers it guarantees
 * the page never shifts when images arrive.
 */
export const BLUR_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 20"><rect width="30" height="20" fill="#2c4f86"/><rect y="13" width="30" height="7" fill="#3b3a36"/></svg>',
  );

export interface HeritageImage {
  readonly src: string;
  readonly alt: string;
  readonly caption: string;
}

/**
 * Illustrations for the milestones, keyed by timeline event id. They are drawn artwork, not
 * archive photographs — the pages label them as such until the school adds its own photos
 * (replace the files under public/images/heritage/ with photographs, keeping 3:2 proportions).
 */
export const HERITAGE_IMAGES: Readonly<Record<string, HeritageImage>> = {
  fondation: {
    src: '/images/heritage/fondation.svg',
    alt: 'رسم توضيحي لمبنى مدرسي صغير محاط بشجرة',
    caption: 'التأسيس — ١٨٩٨',
  },
  campus: {
    src: '/images/heritage/campus.svg',
    alt: 'رسم توضيحي لمبنى من الطوب الأحمر على الطراز الكلاسيكي الجديد بواجهة ذات أعمدة',
    caption: 'مبنى الظاهر — ١٩٠٥',
  },
  chapelle: {
    src: '/images/heritage/chapelle.svg',
    alt: 'رسم توضيحي لكنيسة ذات برج جرس ونافذة وردية',
    caption: 'كنيسة دي لا سال — ١٩٥٨',
  },
  khoronfish: {
    src: '/images/heritage/khoronfish.svg',
    alt: 'رسم توضيحي لمبنيين تصل بينهما أروقة',
    caption: 'الاندماج — ١٩٥٧',
  },
};

export const FALLBACK_IMAGE: HeritageImage = {
  src: '/images/heritage/campus.svg',
  alt: 'رسم توضيحي لمبنى المدرسة',
  caption: '',
};
