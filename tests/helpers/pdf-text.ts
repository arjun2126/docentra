import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";

/** Parse downloaded PDFs, decompress page streams and decode our WinAnsi fonts. */
export async function readPdf(bytes: Uint8Array) {
  const pdf = await PDFDocument.load(bytes);
  const pages: string[] = [];
  const itemLines: string[] = [];
  for (const page of pdf.getPages()) {
    const contents = page.node.lookup(PDFName.of("Contents"));
    const streams = contents instanceof PDFArray
      ? contents.asArray().map((ref) => pdf.context.lookup(ref))
      : [contents];
    const text: string[] = [];
    for (const stream of streams) {
      if (!(stream instanceof PDFRawStream)) throw new Error("Missing PDF page content");
      const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      for (const match of operators.matchAll(/1 0 0 1 ([\d.]+) ([\d.]+) Tm\s*<([0-9a-f]+)>\s*Tj/gi)) {
        const value = new TextDecoder("windows-1252").decode(Buffer.from(match[3], "hex"));
        text.push(value);
        if (Number(match[1]) === 76) itemLines.push(value);
      }
    }
    pages.push(text.join("\n"));
  }
  return { pages, text: pages.join("\n"), itemText: itemLines.join(" ") };
}
