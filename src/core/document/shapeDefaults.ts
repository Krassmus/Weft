import { createId } from "../id";
import type { ShapeCornerRadii, ShapeFill, ShapeGradient, ShapeShadow, ShapeStroke } from "../types";

export function defaultShapeCornerRadii(): ShapeCornerRadii {
  return { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
}

/** A new gradient always starts as a plain two-stop fade so ShapeEditor's own gradient-stop list
 * (BlockPanel.tsx) has something to show and edit right away, rather than an empty, invalid
 * gradient the moment a shape's fill type is first switched to "gradient". */
export function defaultShapeGradient(): ShapeGradient {
  return {
    kind: "linear",
    angle: 90,
    stops: [
      { id: createId(), offset: 0, color: "#4f8cff", opacity: 1 },
      { id: createId(), offset: 100, color: "#1b3a8a", opacity: 1 },
    ],
  };
}

export function defaultShapeFill(): ShapeFill {
  return { type: "solid", color: "#4f8cff", opacity: 1, gradient: defaultShapeGradient() };
}

/** Off by default (`enabled: false`) but still a complete, sensible set of values - the moment
 * someone switches it on via the checkbox in ShapeEditor, it should look like *something*
 * immediately rather than an invisible 0-width/0-opacity stroke. */
export function defaultShapeStroke(): ShapeStroke {
  return { enabled: false, color: "#18181b", width: 0.3, style: "solid", opacity: 1 };
}

export function defaultShapeShadow(): ShapeShadow {
  return { enabled: false, color: "#000000", opacity: 0.35, blur: 1.5, offsetX: 0, offsetY: 0.8 };
}
