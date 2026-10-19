import { useId, useState } from "react";
import type { ReactNode } from "react";

/** A foldable section of a side panel: its title is a heading with the button that folds it (aria-expanded says which state it is in). */
export function Collapsible({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="weft-collapsible">
      <h3 className="weft-collapsible-heading">
        <button type="button" className="weft-collapsible-header" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          <span>{title}</span>
          <span className={"weft-collapsible-chevron" + (open ? " is-open" : "")} aria-hidden="true">
            ⌄
          </span>
        </button>
      </h3>
      {open && (
        <div className="weft-collapsible-body" id={bodyId}>
          {children}
        </div>
      )}
    </section>
  );
}
