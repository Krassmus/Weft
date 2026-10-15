import { DOMParser, HTMLElement, Node, NodeFilter } from "linkedom";

// The command line tool has no browser: the few places in src/core that read html with a DOM (core/document/placeholders.ts) get
// linkedom's, which has the same interface for what they use.
const globals = globalThis as Record<string, unknown>;
globals.DOMParser ??= DOMParser;
globals.HTMLElement ??= HTMLElement;
globals.Node ??= Node;
globals.NodeFilter ??= NodeFilter;
