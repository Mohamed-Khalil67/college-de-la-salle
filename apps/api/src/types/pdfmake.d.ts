/** The slice of pdfmake 0.3's server API that the report cards use (the package ships no types). */
declare module 'pdfmake' {
  interface OutputDocument {
    getBuffer(): Promise<Buffer>;
  }
  interface PdfMake {
    setFonts(
      fonts: Record<string, Record<'normal' | 'bold' | 'italics' | 'bolditalics', string>>,
    ): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    createPdf(docDefinition: object): OutputDocument;
  }
  const pdfmake: PdfMake;
  export default pdfmake;
}
