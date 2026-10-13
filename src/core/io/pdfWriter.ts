/** One page of a PDF made of a picture: a JPEG (`jpeg`, its size in pixels) shown over the whole page, which is `width` x `height` points. */
export interface PdfImagePage {
  jpeg: Uint8Array;
  pixelWidth: number;
  pixelHeight: number;
  /** Clickable areas, as shares of the page (0-1, from its top left corner). */
  links?: { x: number; y: number; width: number; height: number; url: string }[];
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
  // Object numbers: 1 catalog, 2 page tree, 3 info, then three per page (page, content, image), then the links' annotations.
  const pageObject = (i: number) => 4 + i * 3;
  let nextObject = 4 + pages.length * 3;
  const linkObjects: number[][] = pages.map((page) => (page.links ?? []).map(() => nextObject++));
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
    const annots = linkObjects[i].length > 0 ? ` /Annots [${linkObjects[i].map((id) => `${id} 0 R`).join(" ")}]` : "";
    object(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 ${pageId + 2} 0 R >> >> /Contents ${pageId + 1} 0 R${annots} >>`);
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

  pages.forEach((page, i) => {
    const w = pageWidthPt;
    const h = (pageWidthPt * page.pixelHeight) / page.pixelWidth;
    (page.links ?? []).forEach((link, n) => {
      const x1 = link.x * w;
      const x2 = (link.x + link.width) * w;
      // PDF's y axis points up.
      const y1 = h - (link.y + link.height) * h;
      const y2 = h - link.y * h;
      // The address as ASCII (what a PDF string holds): everything else percent-encoded.
      const url = encodeURI(link.url).replace(/[\\()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
      object(
        linkObjects[i][n],
        `<< /Type /Annot /Subtype /Link /Rect [${x1.toFixed(2)} ${y1.toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}] /Border [0 0 0] /A << /S /URI /URI (${url}) >> >>`,
      );
    });
  });

  const count = nextObject;
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
