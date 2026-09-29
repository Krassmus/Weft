import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Block, Page, TimelineEventType, TimelineNode } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { nodeLabel } from "../Timeline";
import { TransitionPanel } from "./TransitionPanel";

function findNode(page: Page, nodeId: string): TimelineNode | undefined {
  for (const lane of page.timeline.lanes) {
    const found = lane.nodes.find((n) => n.id === nodeId);
    if (found) return found;
  }
  return undefined;
}

// Purely descriptive - none of these are configurable here (yet); each event's own trigger
// condition is inherent to what the block that contributes it actually does, not a setting of
// its own. "end" isn't listed - TransitionPanel (rendered below for it instead) already explains
// itself, and a "start" node's hint is written inline since it has no TimelineEventType at all.
const EVENT_HINTS: Partial<Record<TimelineEventType, string>> = {
  "quiz-fill-start": "Passiert, sobald die Lernperson eine erste Antwortoption auswählt.",
  "quiz-submit": "Passiert, sobald das Quiz abgeschickt wird.",
  "quiz-submit-correct": "Passiert, sobald das Quiz mit einer richtigen Antwort abgeschickt wird.",
  "quiz-submit-incorrect": "Passiert, sobald das Quiz mit einer falschen Antwort abgeschickt wird.",
  "video-start-auto": "Passiert automatisch, sobald das Video zu spielen beginnt.",
  "video-start-manual": "Passiert, sobald die Lernperson das Video startet.",
  "video-stop-point": "Passiert, sobald die Wiedergabe diesen Zeitpunkt im Video erreicht.",
  "video-end-loop": "Passiert nie - das Video läuft in einer Endlosschleife und endet nicht.",
  "video-end-stop": "Passiert, sobald das Video zu Ende ist.",
};

/** Every page block whose own Aufbau or Abbau (see BaseBlock.entranceEffect/exitEffect in
 * core/types.ts) fires on `nodeId` - only ever page blocks, since a Layout block has no Aufbau/
 * Abbau UI at all (see BlockPanel's own `page` prop). */
function triggeredBlocks(page: Page, nodeId: string): { block: Block; via: "Aufbau" | "Abbau" }[] {
  const results: { block: Block; via: "Aufbau" | "Abbau" }[] = [];
  for (const block of page.blocks) {
    if (block.entranceEffect.triggerEventId === nodeId) results.push({ block, via: "Aufbau" });
    if (block.exitEffect.triggerEventId === nodeId) results.push({ block, via: "Abbau" });
  }
  return results;
}

/**
 * Shown instead of BlockPanel when the current selection is a node in a page's own timeline/event
 * graph (see SelectionRef's "event" variant in document/store.ts) rather than a block on the
 * canvas - clicking an event is its own kind of selection now, deliberately never a shortcut for
 * selecting whatever block happens to contribute it (see Timeline.tsx's own selectFor). On
 * purpose, nothing content-related ever shows up here - no quiz question, no block position -
 * only how this event relates to the rest of the page: what triggers it (still mostly just
 * descriptive today - see EVENT_HINTS - except "end", which gets the page's own real transition
 * editor, TransitionPanel, since that's the one animation an event itself can actually own right
 * now) and what it in turn triggers (every block whose Aufbau/Abbau names this event, listed
 * below, each a shortcut to select that block for the rest of that editing). Exactly what belongs
 * here is still being worked out - this is deliberately a rough first cut of the categories, not
 * a final layout.
 */
export function EventPanel({ page, nodeId }: { page: Page; nodeId: string }) {
  const select = useDocumentStore((s) => s.select);
  const { t } = useTranslation();
  const node = findNode(page, nodeId);

  if (!node) {
    return (
      <div className="weft-inspector-empty">
        <p>Dieses Ereignis gibt es nicht mehr.</p>
      </div>
    );
  }

  const hint =
    node.kind === "start"
      ? "Passiert automatisch, sobald diese Folie angezeigt wird."
      : node.kind === "event" && node.eventType
        ? EVENT_HINTS[node.eventType]
        : undefined;
  const triggered = triggeredBlocks(page, nodeId);

  return (
    <>
      <div className="weft-event-heading">
        <span className="weft-event-heading-kind">Ereignis</span>
        <p className="weft-event-heading-title">{nodeLabel(node)}</p>
        {hint && <p className="weft-hint">{hint}</p>}
      </div>

      {node.kind === "end" && <TransitionPanel page={page} />}

      <Collapsible title="Löst aus" defaultOpen={triggered.length > 0}>
        {triggered.length === 0 ? (
          <p className="weft-hint">Noch kein Element hat sein Aufbau oder Abbau hierauf gelegt.</p>
        ) : (
          <ul className="weft-event-trigger-list">
            {triggered.map(({ block, via }, i) => (
              <li key={block.id + via + i}>
                <button
                  type="button"
                  className="weft-event-trigger-row"
                  onClick={() => select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: block.id })}
                >
                  <span>{t(BLOCK_KIND_KEYS[block.kind])}</span>
                  <span className="weft-event-trigger-via">{via}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Collapsible>
    </>
  );
}
