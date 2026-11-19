declare module 'word-extractor' {
  export default class WordExtractor { extract(input: Buffer | string): Promise<{ getBody(): string }> }
}
declare module 'pdfjs-dist/legacy/build/pdf.mjs' { export * from 'pdfjs-dist'; }
