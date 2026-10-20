/** Saves a blob as a file through a temporary object URL (browser only; call from an event handler). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function saveText(text: string, filename: string, type = 'text/csv;charset=utf-8'): void {
  // The BOM lets Excel read the accents of a UTF-8 CSV.
  saveBlob(new Blob(['\uFEFF', text], { type }), filename);
}
