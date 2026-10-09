import { orderedValues } from "../../core/document/ordering";
import { pageLabels } from "../../core/document/pageLabels";
import { useDocumentStore } from "../../core/document/store";
import { SlideThumbnail } from "./SlideThumbnail";

/** A page as a small picture (its layout and its own blocks), by page id - or a note that it is gone (a deleted page stays in the
 * document, but is no longer part of the module). */
export function PageMiniature({ pageId }: { pageId: string }) {
  const content = useDocumentStore((s) => s.doc.content);
  const page = content.pages[pageId];
  const layout = page?.layoutId ? content.layouts[page.layoutId] : undefined;
  if (!page || !pageLabels(content)[pageId]) return <div className="weft-miniature-missing">Folie gelöscht</div>;
  return <SlideThumbnail blocks={[...orderedValues(layout?.blocks ?? {}), ...orderedValues(page.blocks)]} />;
}
