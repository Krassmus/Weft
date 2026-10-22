import { createId } from "../id";
import type { WeftDocument } from "../types";
import { plain } from "./plain";

/**
 * What opening a template (WeftModule.template) or an example that ships with Weft makes of it: a module of its own - a new id, new dates,
 * an editing history of its own (none is carried over) - that is not a template any more. It has no file yet, so the first "Speichern" asks
 * where to put it; the file it came from is never written.
 */
export function copyOfTemplate(opened: WeftDocument): WeftDocument {
  const now = new Date().toISOString();
  const content = { ...plain(opened.content), id: createId(), createdAt: now, modifiedAt: now };
  delete content.template;
  return { formatVersion: opened.formatVersion, content };
}
