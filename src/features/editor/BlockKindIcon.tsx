import type { ReactNode } from "react";
import type { Block } from "../../core/types";
import { DESCRIBED_ICONS } from "./describedIcons";

type Kind = Block["kind"];

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;
const ICONS: Partial<Record<Kind, ReactNode>> = {
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" />,
  sort: <path d="M12 4v16M8 8l4-4 4 4M8 16l4 4 4-4" />,
  matching: (
    <>
      <rect x="3" y="4" width="7" height="6" rx="1.4" />
      <rect x="3" y="14" width="7" height="6" rx="1.4" />
      <rect x="14" y="9" width="7" height="6" rx="1.4" />
      <path d="M10 7c2 0 2.5 2.5 4 4M10 17c2 0 2.5-2.5 4-4" />
    </>
  ),
  checker: (
    <>
      <rect x="3" y="4" width="7" height="7" rx="1.6" />
      <path d="m4.9 7.6 1.6 1.6 2.4-3" />
      <path d="M13 6h8M13 9.5h5" />
      <rect x="3" y="15" width="10" height="5" rx="2.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </>
  ),
  audio: (
    <>
      <path d="M4 10v4h3.5l4.5 4V6l-4.5 4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  revealer: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  progress: (
    <>
      <rect x="3" y="9" width="18" height="6" rx="3" />
      <path d="M3 12h9" strokeWidth={5} />
    </>
  ),
  code: <path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12" />,
  tex: <path d="M18 5H7l6 7-6 7h11" />,
  iframe: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
    </>
  ),
  shape: (
    <>
      <circle cx="9" cy="9" r="5" />
      <rect x="11" y="11" width="9" height="9" rx="1.5" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  list: <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />,
  placeholder: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" strokeDasharray="3 3" />
      <path d="M8 12h8" />
    </>
  ),
  link: <path d="M10 14a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1M14 10a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1" />,
  button: (
    <>
      <rect x="3" y="8" width="18" height="8" rx="4" />
      <path d="M8 12h8" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17h.01" />
    </>
  ),
  files: <path d="M6 3h8l4 4v14H6zM14 3v4h4M12 11v6m-3-3 3 3 3-3" />,
  cloze: <path d="M3 8h5M14 8h7M3 16h9M17 16h4M8 12h8" />,
  script: (
    <>
      <path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" />
      <circle cx="12" cy="12" r="2.4" />
      <path d="M12 7.4v1.4M12 15.2v1.4M8 9.7l1.2.7M14.8 13.6l1.2.7M16 9.7l-1.2.7M9.2 13.6L8 14.3" />
    </>
  ),
  language: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
    </>
  ),
};

/** The small picture of an element type - in the "+" menu over the slide and in the list of a slide's elements. */
export function BlockKindIcon({ kind, size = 18 }: { kind: Kind; size?: number }) {
  return (
    <svg className="weft-kind-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...stroke}>
      {ICONS[kind] ?? DESCRIBED_ICONS[kind]}
    </svg>
  );
}
