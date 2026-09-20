import { useState } from "react";
import { addLayout, setPageLayout } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import type { Page } from "../../../core/types";
import { SlideThumbnail } from "../SlideThumbnail";

/**
 * The current layout shown as a clickable thumbnail (not a text title - a page's layout is a
 * visual template, so picking one should look like picking one). Clicking it expands a grid of
 * every layout as a thumbnail to choose from, plus a way to start a new one.
 */
export function LayoutPicker({ page }: { page: Page }) {
  const [open, setOpen] = useState(false);
  const layouts = useDocumentStore((s) => s.doc.content.layouts);
  const select = useDocumentStore((s) => s.select);
  const currentLayout = page.layoutId ? layouts[page.layoutId] : null;

  function choose(layoutId: string | null) {
    setPageLayout(page.id, layoutId);
    setOpen(false);
  }

  return (
    <div className="weft-layout-picker">
      <button type="button" className="weft-layout-current" onClick={() => setOpen((v) => !v)}>
        {currentLayout ? (
          <SlideThumbnail blocks={currentLayout.blocks} />
        ) : (
          <div className="weft-layout-thumb-empty">Kein Layout</div>
        )}
      </button>

      {open && (
        <div className="weft-layout-grid">
          <button type="button" className="weft-layout-grid-item" onClick={() => choose(null)}>
            <div className="weft-layout-thumb-empty">Kein Layout</div>
            <span>Kein Layout</span>
          </button>
          {Object.values(layouts).map((layout) => (
            <button key={layout.id} type="button" className="weft-layout-grid-item" onClick={() => choose(layout.id)}>
              <SlideThumbnail blocks={layout.blocks} />
              <span>{layout.name}</span>
            </button>
          ))}
          <button
            type="button"
            className="weft-layout-grid-item weft-layout-grid-add"
            onClick={() => {
              const id = addLayout("Neues Layout");
              choose(id);
            }}
          >
            + Neues Layout
          </button>
        </div>
      )}

      {currentLayout && (
        <button
          type="button"
          className="weft-ghost-button weft-full-width"
          onClick={() => select({ type: "layout", layoutId: currentLayout.id })}
        >
          Layout bearbeiten
        </button>
      )}
    </div>
  );
}
