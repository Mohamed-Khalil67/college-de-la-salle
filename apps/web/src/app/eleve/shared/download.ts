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
