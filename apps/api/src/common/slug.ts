/** `Physique-Chimie` → `physique-chimie`: lower-case ASCII words joined by dashes, at most `max` characters. */
export function slugify(text: string, max = 40): string {
  const slug = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '');
  return slug || 'x';
}

/** The slug of `text`, numbered (`arts-2`, `arts-3`…) while `taken` says it is in use. */
export async function uniqueSlug(
  text: string,
  taken: (slug: string) => Promise<boolean>,
  max = 40,
): Promise<string> {
  const base = slugify(text, max - 4);
  let slug = base;
  for (let n = 2; await taken(slug); n++) slug = `${base}-${n}`;
  return slug;
}
