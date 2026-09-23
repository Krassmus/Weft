import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

export interface FontSelectOption {
  value: string;
  label: string;
  /** Font to render the "Abc" preview in, next to the label - omitted for a non-font entry
   * like the upload trigger. */
  previewFamily?: string;
}

export interface FontSelectGroup {
  label?: string;
  options: FontSelectOption[];
}

interface FontSelectProps {
  value: string;
  isMixed: boolean;
  groups: FontSelectGroup[];
  onPick: (value: string) => void;
}

/**
 * A font-family picker built as its own popup rather than a native <select>: a native <option>
 * only supports arbitrary CSS styling in some browsers - in Tauri's WKWebView on macOS, the
 * dropdown is drawn by the OS's own system popup menu, which ignores font-family set on an
 * <option> entirely, so an "Abc" preview next to each name rendered as a plain <option> always
 * showed up in the system UI font instead of the font it was meant to preview. Rendering every
 * option as an ordinary DOM element (in a portal, so the sidebar's own overflow:auto can't clip
 * a long list) sidesteps that - the preview is just normal styled content like anywhere else on
 * the page. The trigger and every option use onMouseDown+preventDefault, the same convention as
 * the bold/italic/align buttons in BlockPanel.tsx, so picking a font never steals focus (and
 * with it the text selection) away from the slide - unlike the native <select> this replaces,
 * which had to hop focus away and then restore it.
 */
export function FontSelect({ value, isMixed, groups, onPick }: FontSelectProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setPopupStyle({
        position: "fixed",
        left: rect.left,
        top: rect.bottom + 4,
        width: rect.width,
      });
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const current = groups.flatMap((g) => g.options).find((o) => o.value === value);
  const currentLabel = isMixed ? "Verschiedene …" : (current?.label ?? value);

  return (
    <div className="weft-font-select">
      <button
        ref={triggerRef}
        type="button"
        className="weft-font-select-trigger"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="weft-font-select-trigger-label">{currentLabel}</span>
        {!isMixed && current?.previewFamily && (
          <span className="weft-font-select-preview" style={{ fontFamily: current.previewFamily }}>
            Abc
          </span>
        )}
        <span className="weft-font-select-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open &&
        createPortal(
          <div ref={popupRef} className="weft-font-select-popup" style={popupStyle} role="listbox">
            {groups.map((group, i) => (
              <div key={i} className="weft-font-select-group">
                {group.label && <div className="weft-font-select-group-label">{group.label}</div>}
                {group.options.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={opt.value === value}
                    className={"weft-font-select-option" + (opt.value === value ? " is-selected" : "")}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(false);
                      onPick(opt.value);
                    }}
                  >
                    <span className="weft-font-select-option-label">{opt.label}</span>
                    {opt.previewFamily && (
                      <span className="weft-font-select-preview" style={{ fontFamily: opt.previewFamily }}>
                        Abc
                      </span>
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
