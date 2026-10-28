import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { renderIframe } from "../../../core/blocks/iframe/render.js";
import type { IframeRenderContext, IframeRenderProps } from "../../../core/blocks/iframe/render.js";
import { aspectRatioNumeric } from "../../../core/aspectRatio";
import { useDocumentStore } from "../../../core/document/store";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import { tr } from "../../../core/i18n/tr";
import type { IframeBlock } from "../../../core/types";
import globeIconSvg from "../../../../mockups/icons/globe.svg?raw";
import qrIconSvg from "../../../../mockups/icons/code-qr.svg?raw";
import { RenderHost } from "./RenderHost";

/**
 * An embedded page as it is drawn in the editor - the canvas, the thumbnails and the PDF: by the function the player draws it with (blocks/iframe/
 * render.js), told where it is drawn. On the canvas the page is live (so that the author sees it; the block is not an inert picture of it, but
 * nothing in it can be used), in a thumbnail it is a grey box with an icon, in the PDF a card with the address and the QR code (`qrSvg`, made for it).
 */
export function IframeView({ block, lang, mode, qrSvg }: { block: IframeBlock; lang: string | null; mode: IframeRenderContext["mode"]; qrSvg?: string }) {
  const aspectRatio = useDocumentStore((s) => s.doc.content.aspectRatio);
  // The code of the gate on the canvas (a QR code is made by a library, in a moment: until then the place is marked).
  const [canvasQr, setCanvasQr] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== "edit" || !block.qrCode || !block.url) {
      setCanvasQr(null);
      return;
    }
    let cancelled = false;
    QRCode.toString(block.url, { type: "svg", margin: 1 })
      .then((svg) => !cancelled && setCanvasQr(svg))
      .catch(() => !cancelled && setCanvasQr(null));
    return () => {
      cancelled = true;
    };
  }, [mode, block.qrCode, block.url]);

  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const props: IframeRenderProps = {
    id: block.id,
    url: block.url,
    sandbox: block.sandbox,
    allow: block.allow,
    qrCode: block.qrCode,
    presentationUrl: block.presentationUrl,
    forcedViewportWidth: block.forcedViewportWidth,
    heightOverWidth: (1 / aspectRatioNumeric(aspectRatio)) * (block.position.height / block.position.width),
    qrSvg: mode === "print" ? (qrSvg ?? null) : mode === "edit" ? canvasQr : null,
  };
  const ctx: IframeRenderContext = {
    mode,
    text: (key) => (key === "noAddress" ? tr("ui.no_address") : (strings[key] ?? "")),
    icons: { globe: globeIconSvg, qr: qrIconSvg },
  };
  return <RenderHost render={renderIframe} props={props} ctx={ctx} />;
}
