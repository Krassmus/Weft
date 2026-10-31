import { DOMParser } from "linkedom";
import { beforeAll, describe, expect, it } from "vitest";
import { svgAspectRatio } from "../src/core/document/actions";

/**
 * The size an SVG file is drawn in decides the shape of the picture block it becomes (createImageBitmap does not decode an SVG, so the size comes
 * from the file): width and height if it has both as numbers, else its viewBox, else a square.
 */
// (The editor has a DOM; here linkedom's, as in the command line tool.)
beforeAll(() => {
  Object.assign(globalThis, { DOMParser });
});

const svg = (attributes: string) => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}><rect width="10" height="10"/></svg>`;

describe("the aspect ratio of an SVG", () => {
  it("is its width over its height when it has both - with or without a unit", () => {
    expect(svgAspectRatio(svg('width="300" height="150"'))).toBe(2);
    expect(svgAspectRatio(svg('width="12cm" height="3cm"'))).toBe(4);
  });

  it("goes by the viewBox where there is no size - or only one that is a percentage", () => {
    expect(svgAspectRatio(svg('viewBox="0 0 200 100"'))).toBe(2);
    expect(svgAspectRatio(svg('viewBox="10,20,50,100"'))).toBe(0.5);
    expect(svgAspectRatio(svg('width="100%" height="100%" viewBox="0 0 400 100"'))).toBe(4);
  });

  it("takes the width and height before the viewBox when both are there", () => {
    expect(svgAspectRatio(svg('width="100" height="100" viewBox="0 0 400 100"'))).toBe(1);
  });

  it("is a square where the file says nothing, or is no SVG", () => {
    expect(svgAspectRatio(svg(""))).toBe(1);
    expect(svgAspectRatio(svg('viewBox="0 0 0 0"'))).toBe(1);
    expect(svgAspectRatio("not an svg at all")).toBe(1);
  });
});
