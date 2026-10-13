/** One page of a PDF made of a picture: a JPEG (`jpeg`, its size in pixels) shown over the whole page, which is `width` x `height` points. */
export interface PdfImagePage {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
}

const encoder = new TextEncoder();

/** A PDF text string: the plain characters if they are ASCII, else UTF-16BE with a byte order mark (as a hex string). */
function pdfString(text: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(text)) return `(${text.replace(/[\\()]/g, "\\$&")})`;
  let hex = "FEFF";
  for (let i = 0; i < text.length; i++) hex += text.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/**
 * The bytes of a PDF with one page per picture, each page as large as `pageWidthPt` wide (and as high as its picture's shape says) -
 * no library: a PDF whose pages are JPEGs is a handful of objects (catalog, page tree, and for every page the page, its content
 * and the image). The text on the pages is part of the pictures (not selectable), which is what rendering a slide to a picture gives.
 */
export function buildImagePdf(pages: PdfImagePage[], title: string, pageWidthPt = 960): Uint8Array {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    parts.push(bytes);
    length += bytes.length;
  };
  // Object numbers: 1 catalog, 2 page tree, 3 info, then three per page (page, content, image).
  const pageObject = (i: number) => 4 + i * 3;
  const object = (id: number, body: string | Uint8Array[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    if (typeof body === "string") push(body);
    else for (const chunk of body) push(chunk);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  object(1, "<< /Type /Catalog /Pages 2 0 R >>");
  object(2, `<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObject(i)} 0 R`).join(" ")}] >>`);
  object(3, `<< /Title ${pdfString(title)} /Producer (Weft) >>`);

  pages.forEach((page, i) => {
    const w = pageWidthPt;
    const h = Math.round((pageWidthPt * page.pixelHeight) / page.pixelWidth * 100) / 100;
    const pageId = pageObject(i);
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R >>`);
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    object(pageId + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    object(pageId + 2, [
      encoder.encode(
        `<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
      ),
      page.jpeg,
      encoder.encode("\nendstream"),
    ]);
  });

  const count = 4 + pages.length * 3;
  const xrefAt = length;
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  push(xref);
  push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
