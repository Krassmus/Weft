import { useState } from "react";
import type { ReactNode } from "react";

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

  return (
    <section className="weft-collapsible">
      <button type="button" className="weft-collapsible-header" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <span className={"weft-collapsible-chevron" + (open ? " is-open" : "")}>⌄</span>
      </button>
      {open && <div className="weft-collapsible-body">{children}</div>}
    </section>
  );
}
