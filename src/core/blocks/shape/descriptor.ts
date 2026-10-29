import { defaultShapeCornerRadii, defaultShapeFill, defaultShapeShadow, defaultShapeStroke } from "../../document/shapeDefaults";
import type { ShapeBlock } from "../../types";
import type { BlockDescriptor } from "../types";

/**
 * A shape: a rectangle, an ellipse, a polygon or a star, with a fill, an outline and a shadow - the plain background of a slide as much as a frosted
 * pane (`blurBehind`). Only the things that are one value each are fields: the corners (`cornerRadii`), the fill (colour, gradient), the outline and
 * the shadow are objects the panel (ShapeEditor in panels/BlockPanel.tsx) edits. One function draws it for the player, the canvas, the thumbnails and the
 * PDF (blocks/shape/render.js); only the blur of what is behind it (`blurBehind`) is the block's own CSS or a pane of glass under it (backdropBlur.ts).
 */
export const shapeBlock: BlockDescriptor<ShapeBlock> = {
  kind: "shape",
  version: 1,
  cliName: "Form",
  schemaDefinition: "ShapeBlock",
  description:
    "Eine Form: Rechteck, Ellipse, Vieleck (`sides`, 3-20 Ecken) oder Stern (`starPoints` Zacken, `starInnerRadius`: wie weit innen die Einkerbungen liegen) mit Füllung (`fill`: Farbe oder Verlauf), Linie (`stroke`) und Schatten (`shadow`); ein Rechteck hat Eckenradien (`cornerRadii`), ein Rechteck oder eine Ellipse kann mit `blurBehind` weichzeichnen, was hinter ihr liegt.",
  placement: { pageOnly: false, box: { x: 30, y: 30, width: 40, height: 40 } },
  fields: {
    shapeKind: { type: "choice", options: ["rectangle", "ellipse", "polygon", "star"] },
    sides: { type: "int", min: 3 },
    starPoints: { type: "int", min: 3 },
    starInnerRadius: { type: "number", min: 0, max: 100 },
    blurBehind: { type: "bool" },
  },
  defaults: () => ({
    kind: "shape",
    shapeKind: "rectangle",
    cornerRadii: defaultShapeCornerRadii(),
    sides: 6,
    starPoints: 5,
    starInnerRadius: 45,
    fill: defaultShapeFill(),
    stroke: defaultShapeStroke(),
    shadow: defaultShapeShadow(),
  }),
  summary: (block) => block.shapeKind,
};
