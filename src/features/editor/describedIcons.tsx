import type { ReactNode } from "react";
import type { Block } from "../../core/types";

/** The icons (24 by 24, drawn with lines - see BlockKindIcon) of the kinds of block that describe themselves (core/blocks), which have no entry in BlockKindIcon's own table. */
export const DESCRIBED_ICONS: Partial<Record<Block["kind"], ReactNode>> = {
  solution: (
    <>
      <rect x="3" y="5" width="18" height="8" rx="1.8" />
      <path d="M7 9h.01M11 9h.01M15 9h.01" strokeWidth="2.6" />
      <rect x="8" y="16" width="8" height="3.6" rx="1.4" />
    </>
  ),
  gallery: (
    <>
      <rect x="6" y="5" width="12" height="11" rx="1.6" />
      <path d="M6 13l3.4-3.4 3 3 2.2-2.2L18 14" />
      <path d="M3 10.5v1M21 10.5v1" />
      <circle cx="10" cy="19" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="14" cy="19" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
};
