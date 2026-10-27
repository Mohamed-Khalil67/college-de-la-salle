/** Hands a file to the browser's download (an object URL on a temporary link), then frees the URL. */
export function saveFile(doc: Document, blob: Blob, name: string): void {
  const view = doc.defaultView;
  if (!view) return;
  const url = view.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  doc.body.append(link);
  link.click();
  link.remove();
  view.setTimeout(() => view.URL.revokeObjectURL(url), 1000);
}

/** Saves text as a file; CSV by default, with a BOM so Excel reads the accents of UTF-8. */
export function saveText(doc: Document, text: string, name: string, type = 'text/csv;charset=utf-8'): void {
  saveFile(doc, new Blob(['﻿', text], { type }), name);
}
