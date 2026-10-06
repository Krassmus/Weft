import { setEventTrigger, updateBlock } from "../../../core/document/actions";
import {
  canTriggerFrom,
  computeAdvanceChainTail,
  findNode,
  getBlockEntranceTrigger,
  getBlockExitTrigger,
  getEndTrigger,
  blockEffectNodeId,
  getVideoStartTrigger,
  isTriggerableNode,
  triggerEdgeList,
} from "../../../core/document/pageTimeline";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Page, TimelineEdge, TimelineEventType, TimelineNode, VideoBlock } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { listPageTriggerEvents, listTriggerableNodes, nodeLabel } from "../Timeline";
import { BlockEffectEditor } from "./BlockPanel";
import { TransitionPanel } from "./TransitionPanel";
import { TriggerPicker } from "./TriggerPicker";

// Purely descriptive, for every event that ISN'T in TRIGGERABLE_EVENT_TYPES (document/
// pageTimeline.ts) and so gets no editable "Ausgelöst durch" of its own (see TriggerSection
// below) - each only ever happens through genuine learner interaction or real playback time that
// nothing could fake, so there's nothing here to edit, just to explain. "block-entrance"/"-exit"/
// "video-start-*" aren't listed - those ARE triggerable, see TriggerSection.
const EVENT_HINTS: Partial<Record<TimelineEventType, string>> = {
  "quiz-fill-start": "Passiert, sobald die Lernperson eine erste Antwortoption auswählt.",
  "quiz-submit": "Passiert, sobald das Quiz abgeschickt wird.",
  "quiz-submit-correct": "Passiert, sobald das Quiz mit einer richtigen Antwort abgeschickt wird.",
  "quiz-submit-incorrect": "Passiert, sobald das Quiz mit einer falschen Antwort abgeschickt wird.",
  "video-stop-point": "Passiert, sobald die Wiedergabe diesen Zeitpunkt im Video erreicht.",
  "video-end-loop": "Passiert nie - das Video läuft in einer Endlosschleife und endet nicht.",
  "video-end-stop": "Passiert, sobald das Video zu Ende ist.",
};

/**
 * Shown instead of BlockPanel when the current selection is a node in a page's own timeline/event
 * graph (see SelectionRef's "event" variant in document/store.ts) rather than a block on the
 * canvas - clicking an event is its own kind of selection now, deliberately never a shortcut for
 * selecting whatever block happens to contribute it (see Timeline.tsx's own selectFor). On
 * purpose, nothing content-related ever shows up here - no quiz question, no block position -
 * only how this event relates to the rest of the page: which object it belongs to ("Gehört zu"),
 * what triggers it ("Ausgelöst durch" - TriggerSection, editable for TRIGGERABLE_EVENT_TYPES,
 * otherwise just EVENT_HINTS' own descriptive sentence), and what it in turn triggers ("Löst aus"
 * - OutgoingTriggersSection). "start" gets no "Ausgelöst durch" (it's the one event that isn't
 * caused by anything else on the page); "end" gets no "Löst aus" (the slide is already gone by
 * the time it fires) - it gets the page's own real transition editor, TransitionPanel, instead,
 * since that's the one animation "end" itself can actually own.
 */
export function EventPanel({ page, nodeId }: { page: Page; nodeId: string }) {
  const select = useDocumentStore((s) => s.select);
  const { t } = useTranslation();
  const rawNode = findNode(page, nodeId);

  if (!rawNode) {
    return (
      <div className="weft-inspector-empty">
        <p>Dieses Ereignis gibt es nicht mehr.</p>
      </div>
    );
  }

  // A non-stopping stop point showing its one child inline (see TimelineNode.inlineChild's own
  // doc comment and Timeline.tsx's matching display swap) is selected by its own real id (that's
  // what's actually rendered at that graph position), but everything below should describe and
  // edit the CHILD it stands in for - matching what the graph itself visually shows there.
  const node = rawNode.inlineChild && rawNode.children?.length === 1 ? rawNode.children[0].node : rawNode;

  const sourceBlock = node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;

  return (
    <>
      <div className="weft-event-heading">
        <span className="weft-event-heading-kind">Ereignis</span>
        <p className="weft-event-heading-title">{nodeLabel(node)}</p>
        {node.kind === "start" && <p className="weft-hint">Passiert automatisch, sobald diese Folie angezeigt wird.</p>}
      </div>

      {sourceBlock && (
        <div className="weft-event-source">
          <span className="weft-hint">Gehört zu</span>
          <button
            type="button"
            className="weft-event-trigger-row"
            onClick={() => select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: sourceBlock.id })}
          >
            <span>{t(BLOCK_KIND_KEYS[sourceBlock.kind])}</span>
          </button>
        </div>
      )}

      {node.kind === "end" && <TransitionPanel page={page} />}
      {node.kind === "end" && <EndTriggerSection page={page} />}

      <TriggerSection page={page} node={node} />
      <OutgoingTriggersSection page={page} node={node} />
    </>
  );
}

/** "Ausgelöst durch": editable (a real source-event picker + delay, backed by
 * page.timeline.triggerEdges - see setEventTrigger in document/actions.ts) for a triggerable node
 * (see TRIGGERABLE_EVENT_TYPES), a plain descriptive sentence (EVENT_HINTS) for anything else, and
 * nothing at all for "start"/"end" (see this file's own module doc comment for why). */
function TriggerSection({ page, node }: { page: Page; node: TimelineNode }) {
  if (node.kind !== "event" || !node.eventType) return null;

  if (!isTriggerableNode(node)) {
    return (
      <div className="weft-event-section">
        <span className="weft-hint-label">Ausgelöst durch</span>
        <p className="weft-hint">{EVENT_HINTS[node.eventType] ?? "Passiert durch Interaktion der Lernperson."}</p>
      </div>
    );
  }

  const sourceBlock = node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;

  // A block's own Aufbau/Abbau node edits exactly what that block's own panel does - the same
  // "Aufbau"/"Abbau" section (animation, duration, direction, trigger), not just the trigger.
  if ((node.eventType === "block-entrance" || node.eventType === "block-exit") && sourceBlock) {
    const phase = node.eventType === "block-entrance" ? "entrance" : "exit";
    const ownEffectNodeIds = new Set([blockEffectNodeId(sourceBlock.id, "entrance"), blockEffectNodeId(sourceBlock.id, "exit")]);
    return (
      <BlockEffectEditor
        key={node.id}
        title={phase === "entrance" ? "Aufbau" : "Abbau"}
        page={page}
        targetNodeId={node.id}
        effect={phase === "entrance" ? sourceBlock.entranceEffect : sourceBlock.exitEffect}
        trigger={phase === "entrance" ? getBlockEntranceTrigger(page, sourceBlock) : getBlockExitTrigger(page, sourceBlock)}
        events={listPageTriggerEvents(page).filter((e) => !ownEffectNodeIds.has(e.id))}
        onEffectChange={(effect) =>
          updateBlock(page.id, sourceBlock.id, phase === "entrance" ? { entranceEffect: effect } : { exitEffect: effect })
        }
        onTriggerChange={(from, delayMs, kind) => setEventTrigger(page.id, node.id, from, delayMs, kind)}
      />
    );
  }

  const trigger =
    node.eventType === "block-entrance" && sourceBlock
      ? getBlockEntranceTrigger(page, sourceBlock)
      : node.eventType === "block-exit" && sourceBlock
        ? getBlockExitTrigger(page, sourceBlock)
        : sourceBlock
          ? getVideoStartTrigger(page, sourceBlock as VideoBlock)
          : null;
  // Entrance always has SOME trigger (a block has to appear somehow) - no "none" option for it.
  // Exit and a video's own start both have a sensible "nothing scripted" default of their own
  // (never automatically disappearing; starting only on the learner's own click) - see
  // getBlockExitTrigger/getVideoStartTrigger.
  const allowNoTrigger = node.eventType !== "block-entrance";
  const noTriggerLabel = node.eventType === "block-exit" ? "Kein automatischer Abbau" : "Manueller Klick (kein automatischer Start)";
  // Never itself, and never anything IT already triggers below (see OutgoingTriggersSection) -
  // both would just be a node pointing at its own not-yet-fired self by another route.
  const options = listPageTriggerEvents(page).filter((e) => e.id !== node.id);

  return (
    <div className="weft-event-section">
      <TriggerPicker
        page={page}
        targetNodeId={node.id}
        trigger={trigger}
        options={options}
        allowNoTrigger={allowNoTrigger}
        noTriggerLabel={noTriggerLabel}
        onChange={(from, delayMs, kind) => setEventTrigger(page.id, node.id, from, delayMs, kind)}
      />
    </div>
  );
}

/**
 * "Ausgelöst durch" for "Nächste Folie" specifically - deliberately narrower than TriggerSection's
 * general TriggerPicker: "end" only ever offers "Weiter" (the default - one more Weiter press
 * after whatever else is queued leaves the page) or "Gar nicht" (the page can then only be left
 * some other way - a button block, a quiz's own auto-advance), never an arbitrary timed source
 * (see getEndTrigger's own doc comment for why). Reuses just the "nach welchem Ereignis"
 * sub-picker pattern for reordering where in the Weiter queue this slots in.
 */
function EndTriggerSection({ page }: { page: Page }) {
  const trigger = getEndTrigger(page);
  // Never something that already waits for "end" (see canTriggerFrom); the current source stays.
  const options = listPageTriggerEvents(page).filter((e) => e.id === trigger?.from || canTriggerFrom(page, e.id, "end"));

  return (
    <div className="weft-event-section">
      <label className="weft-field">
        <span>Ausgelöst durch</span>
        <select
          value={trigger ? "weiter" : ""}
          onChange={(e) =>
            e.target.value === "weiter"
              ? setEventTrigger(page.id, "end", computeAdvanceChainTail(page, "end"), 0, "advance")
              : // "Gar nicht" has to be an explicit, stored edge, not the ABSENCE of one - an
                // absent edge is exactly what a page that's never been configured at all also
                // looks like (see getEndTrigger's own doc comment), which defaults to "Weiter".
                // Any non-"advance" kind reads back as "Gar nicht" there; "unknown" is simplest,
                // since nothing else ever writes that kind for "end".
                setEventTrigger(page.id, "end", "start", 0, "unknown")
          }
        >
          <option value="">Gar nicht</option>
          <option value="weiter">Weiter</option>
        </select>
      </label>
      {trigger && (
        <label className="weft-field">
          <span>Nach welchem Ereignis</span>
          <select value={trigger.from} onChange={(e) => setEventTrigger(page.id, "end", e.target.value, 0, "advance")}>
            {options.map((event) => (
              <option key={event.id} value={event.id}>
                {event.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

function outgoingTriggers(page: Page, nodeId: string): { edge: TimelineEdge; targetNode: TimelineNode }[] {
  const results: { edge: TimelineEdge; targetNode: TimelineNode }[] = [];
  for (const edge of triggerEdgeList(page.timeline)) {
    if (edge.from !== nodeId) continue;
    const targetNode = findNode(page, edge.to);
    if (targetNode) results.push({ edge, targetNode });
  }
  return results;
}

/** "Löst aus": every trigger edge FROM this node (see outgoingTriggers) - each with its own delay,
 * editable in place, and a way to remove it - plus, when there's anything left to pick, a way to
 * add a new one (see TRIGGERABLE_EVENT_TYPES for what may ever be a target at all). Not shown for
 * "end" - the slide is already gone by the time it fires, so it can't still trigger anything on
 * this page (see this file's own module doc comment). */
function OutgoingTriggersSection({ page, node }: { page: Page; node: TimelineNode }) {
  const select = useDocumentStore((s) => s.select);
  const { t } = useTranslation();
  if (node.kind === "end") return null;

  const outgoing = outgoingTriggers(page, node.id);
  const targetedIds = new Set(outgoing.map((o) => o.targetNode.id));
  const addableTargets = listTriggerableNodes(page).filter((target) => target.id !== node.id && !targetedIds.has(target.id));

  return (
    <Collapsible title="Löst aus" defaultOpen={outgoing.length > 0}>
      {outgoing.length === 0 ? (
        <p className="weft-hint">Löst noch nichts aus.</p>
      ) : (
        <ul className="weft-event-trigger-list">
          {outgoing.map(({ edge, targetNode }) => {
            const targetBlock = targetNode.sourceBlockId ? page.blocks[targetNode.sourceBlockId] : undefined;
            return (
              <li key={targetNode.id} className="weft-event-trigger-row-wrap">
                <button
                  type="button"
                  className="weft-event-trigger-row"
                  disabled={!targetBlock}
                  onClick={() => targetBlock && select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: targetBlock.id })}
                >
                  <span>{nodeLabel(targetNode)}</span>
                  {targetBlock && <span className="weft-event-trigger-via">{t(BLOCK_KIND_KEYS[targetBlock.kind])}</span>}
                </button>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  className="weft-event-trigger-delay"
                  title="Verzögerung (Sekunden)"
                  value={(edge.delayMs ?? 0) / 1000}
                  onChange={(e) => {
                    const seconds = Number(e.target.value);
                    if (!Number.isFinite(seconds) || seconds < 0) return;
                    setEventTrigger(page.id, targetNode.id, node.id, Math.round(seconds * 1000));
                  }}
                />
                <button
                  type="button"
                  className="weft-event-trigger-remove"
                  aria-label="Auslöser entfernen"
                  onClick={() => setEventTrigger(page.id, targetNode.id, null, 0)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {addableTargets.length > 0 && (
        <label className="weft-field">
          <span>Weiteres Ziel hinzufügen</span>
          <select value="" onChange={(e) => e.target.value && setEventTrigger(page.id, e.target.value, node.id, 0)}>
            <option value="" disabled>
              Ereignis wählen…
            </option>
            {addableTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </Collapsible>
  );
}
