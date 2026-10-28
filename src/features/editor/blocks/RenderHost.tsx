import { useLayoutEffect, useRef } from "react";

/**
 * Draws a block with the one function that the player uses as well (core/blocks/<kind>/render.js): the block is drawn into an element of the size
 * of its box, and again when what it says changes. In the editor it is only ever a picture (the mode is "edit", "thumbnail" or "print"): nothing in
 * it can be used - the pointer goes to the block, to be selected and dragged.
 */
export function RenderHost<P, C>({ render, props, ctx }: { render: (root: HTMLElement, props: P, ctx: C) => { destroy(): void }; props: P; ctx: C }) {
  const ref = useRef<HTMLDivElement>(null);
  // (A new object every time it is drawn: what is compared is what it says.)
  const key = JSON.stringify(props) + JSON.stringify((ctx as { mode?: string }).mode);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const instance = render(root, props, ctx);
    return () => {
      instance.destroy();
      root.replaceChildren();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [render, key]);
  // (Inert: it is a picture - nothing in it takes the focus or is read out, and a press goes to the block under it.)
  return <div ref={ref} className="weft-render-host" inert />;
}
