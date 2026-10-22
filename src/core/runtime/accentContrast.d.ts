/** WCAG's contrast ratio of two colours ("#rrggbb"), 1 to 21 (see accentContrast.js). */
export function contrastRatio(a: string, b: string): number;

/** The colour to draw `accent` in on `background` so that it stands out by at least `ratio` (see accentContrast.js). */
export function accentInk(accent: string, background: string, ratio: number): string;
