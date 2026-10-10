import { addTrigger, removeTrigger, setEventTitle, setGroupEffect, updateBlock, updateTrigger } from "../../../core/document/actions";
import {
  canTriggerFrom,
  endNodeIds,
  findNode,
  getBlockEntranceTrigger,
  getBlockExitTrigger,
  incomingTriggers,
  isTriggerableNode,
  outgoingTriggers,
} from "../../../core/document/pageTimeline";
import { useDocumentStore } from "../../../core/document/store";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Page, TimelineEventType, TimelineNode } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { buildGraphModel } from "../eventGraph/model";
import { eventTitle, listPageTriggerEvents, listTriggerableNodes, nodeLabel } from "../Timeline";
import { BlockEffectEditor } from "./BlockPanel";
import { TransitionPanel } from "./TransitionPanel";

// Purely descriptive, for every event that ISN'T in TRIGGERABLE_EVENT_TYPES (document/
// pageTimeline.ts) and so gets no editable "Wird ausgelöst durch" of its own (see
// IncomingTriggersSection below) - each only ever happens through genuine learner interaction or
// real playback time that nothing could fake, so there's nothing here to edit, just to explain.
const EVENT_HINTS: Partial<Record<TimelineEventType, string>> = {
  "button-click": "Passiert, sobald die Lernperson den Button anklickt.",
  "quiz-fill-start": "Passiert, sobald die Lernperson eine erste Antwortoption auswählt.",
  "quiz-submit": "Passiert, sobald das Quiz abgeschickt wird.",
  "quiz-submit-correct": "Passiert, sobald das Quiz mit einer richtigen Antwort abgeschickt wird.",
  "quiz-submit-incorrect": "Passiert, sobald das Quiz mit einer falschen Antwort abgeschickt wird.",
  "video-stop-point": "Passiert, sobald die Wiedergabe diesen Zeitpunkt im Video erreicht.",
  "video-end-loop": "Passiert nie - das Video läuft in einer Endlosschleife und endet nicht.",
  "video-end-stop": "Passiert, sobald das Video zu Ende ist.",
};

/**
 * Shown instead of BlockPanel when the current selection is a node in a page's own event graph (see SelectionRef's "event" variant in
 * document/store.ts) rather than a block on the canvas - clicking an event is its own kind of selection, deliberately never a
 * shortcut for selecting whatever block happens to contribute it (see Timeline.tsx). Nothing content-related shows up here, only how
 * this event relates to the rest of the page (docs/event-graph.md, section 7):
 *
 * - the title (the standard one or the author's own),
 * - what it belongs to,
 * - for an Aufbau/Abbau its animation, for "Nächste Folie" its transition,
 * - "Wird ausgelöst durch": every trigger that leads to it - where it comes from, after what delay, whether it waits for Weiter -
 *   and a way to add one (any one of them is enough to make the event happen),
 * - "Löst aus": every trigger that starts at it, the same way,
 * - a warning if nothing can make it happen.
 *
 * "start" has no incoming triggers (it is the one event nothing on the page causes); "Nächste Folie" has no outgoing ones (the slide is
 * already gone by the time it fires).
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

  // A non-stopping stop point showing its one child inline (see TimelineNode.inlineChild) is selected by its own real id, but
  // everything below should describe and edit the CHILD it stands in for.
  const node = rawNode.inlineChild && rawNode.children?.length === 1 ? rawNode.children[0].node : rawNode;

  const sourceBlock = node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;
  const sourceGroup = node.sourceGroupId ? page.groups.find((g) => g.id === node.sourceGroupId) : undefined;
  // Nothing can make it happen (see docs/event-graph.md): shown red in the graph, and said here.
  const unreachable = buildGraphModel(page).nodes.find((n) => n.id === node.id)?.unreachable ?? false;

  return (
    <>
      <div className="weft-event-heading">
        <span className="weft-event-heading-kind">Ereignis</span>
        <p className="weft-event-heading-title">{eventTitle(page, node)}</p>
        {node.kind === "start" && <p className="weft-hint">Passiert automatisch, sobald diese Folie angezeigt wird.</p>}
      </div>

      {unreachable && (
        <div className="weft-placeholder-warning">
          <p>
            ⚠ Nichts löst dieses Ereignis aus - es passiert nie.
            {node.kind === "end" ? " Die Folie lässt sich nur noch auf anderem Wege verlassen, zum Beispiel mit einem Button." : ""}
          </p>
        </div>
      )}

      <TitleField page={page} node={node} />

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

      {sourceGroup && (
        <div className="weft-event-source">
          <span className="weft-hint">Gehört zu</span>
          <button
            type="button"
            className="weft-event-trigger-row"
            onClick={() => select({ type: "group", pageId: page.id, groupId: sourceGroup.id })}
          >
            <span>Gruppe ({sourceGroup.blockIds.length} Objekte)</span>
          </button>
        </div>
      )}

      {node.kind === "end" && <TransitionPanel page={page} endId={node.id} />}
      <EffectSection page={page} node={node} />

      <IncomingTriggersSection page={page} node={node} />
      <OutgoingTriggersSection page={page} node={node} />
    </>
  );
}

/** The title of the event in the graph: empty keeps the standard one. */
function TitleField({ page, node }: { page: Page; node: TimelineNode }) {
  return (
    <label className="weft-field">
      <span>Titel im Graphen</span>
      <input
        value={page.timeline.titles?.[node.id] ?? ""}
        placeholder={nodeLabel(node)}
        onChange={(e) => setEventTitle(page.id, node.id, e.target.value)}
        // Spaces at the ends are only trimmed once the field is left - while typing, "Mein " has to stay "Mein ".
        onBlur={(e) => {
          const stored = page.timeline.titles?.[node.id];
          if (stored !== undefined && stored !== stored.trim()) setEventTitle(page.id, node.id, e.target.value.trim());
        }}
      />
    </label>
  );
}

/** What an Aufbau/Abbau does: the same animation settings as that block's own panel (without the trigger - that is listed below). */
function EffectSection({ page, node }: { page: Page; node: TimelineNode }) {
  const group = node.sourceGroupId ? page.groups.find((g) => g.id === node.sourceGroupId) : undefined;
  if (group && (node.eventType === "group-entrance" || node.eventType === "group-exit")) {
    const phase = node.eventType === "group-entrance" ? "entrance" : "exit";
    const effect = phase === "entrance" ? group.entranceEffect : group.exitEffect;
    if (!effect) return null;
    return (
      <BlockEffectEditor
        key={node.id}
        title={phase === "entrance" ? "Aufbau" : "Abbau"}
        page={page}
        targetNodeId={node.id}
        effect={effect}
        trigger={null}
        events={[]}
        hideTrigger
        onEffectChange={(next) => setGroupEffect(page.id, group.id, phase, next)}
        onTriggerChange={() => undefined}
      />
    );
  }
  const sourceBlock = node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;
  if (!sourceBlock || (node.eventType !== "block-entrance" && node.eventType !== "block-exit")) return null;
  const phase = node.eventType === "block-entrance" ? "entrance" : "exit";
  return (
    <BlockEffectEditor
      key={node.id}
      title={phase === "entrance" ? "Aufbau" : "Abbau"}
      page={page}
      targetNodeId={node.id}
      effect={phase === "entrance" ? sourceBlock.entranceEffect : sourceBlock.exitEffect}
      trigger={phase === "entrance" ? getBlockEntranceTrigger(page, sourceBlock) : getBlockExitTrigger(page, sourceBlock)}
      events={[]}
      hideTrigger
      onEffectChange={(effect) => updateBlock(page.id, sourceBlock.id, phase === "entrance" ? { entranceEffect: effect } : { exitEffect: effect })}
      onTriggerChange={() => undefined}
    />
  );
}

/** One trigger as a small card: the event at its other end, the delay, whether it waits for Weiter, and a way to remove it. */
function TriggerCard({
  page,
  triggerId,
  endpoint,
  endpointLabel,
  options,
  delayMs,
  weiter,
  loop,
  onEndpoint,
}: {
  page: Page;
  triggerId: string;
  /** The event at the other end of the trigger (its source for an incoming one, its target for an outgoing one). */
  endpoint: string;
  endpointLabel: string;
  options: { id: string; label: string }[];
  delayMs: number;
  weiter: boolean;
  /** Whether this trigger would close a loop (see canTriggerFrom). */
  loop: boolean;
  onEndpoint: (id: string) => void;
}) {
  // The current end stays listed even if it isn't among the offered ones (e.g. an event that is not a choice any more).
  const listed = options.some((o) => o.id === endpoint);
  return (
    <li className="weft-trigger-card">
      <select value={endpoint} onChange={(e) => onEndpoint(e.target.value)} title={endpointLabel}>
        {!listed && <option value={endpoint}>{endpointLabel}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <div className="weft-trigger-card-row">
        <label className="weft-trigger-card-delay" title="Verzögerung (Sekunden)">
          <input
            type="number"
            min={0}
            step={0.1}
            value={delayMs / 1000}
            onChange={(e) => {
              const seconds = Number(e.target.value);
              if (Number.isFinite(seconds) && seconds >= 0) updateTrigger(page.id, triggerId, { delayMs: Math.round(seconds * 1000) });
            }}
          />
          <span>s</span>
        </label>
        <label className="weft-trigger-card-weiter">
          <input type="checkbox" checked={weiter} onChange={(e) => updateTrigger(page.id, triggerId, { weiter: e.target.checked })} />
          <span>wartet auf Weiter</span>
        </label>
        <button type="button" className="weft-event-trigger-remove" aria-label="Auslöser entfernen" onClick={() => removeTrigger(page.id, triggerId)}>
          ×
        </button>
      </div>
      {loop && <p className="weft-hint">⟲ Das schließt einen Kreis: Die Ereignisse lösen sich gegenseitig aus.</p>}
    </li>
  );
}

/** "Wird ausgelöst durch": every trigger that leads to this event (any one is enough to make it happen). Not for "start", and
 * for events only the learner or playback can cause just a description. */
function IncomingTriggersSection({ page, node }: { page: Page; node: TimelineNode }) {
  if (node.kind === "start") return null;

  if (node.kind === "event" && node.eventType && !isTriggerableNode(node)) {
    return (
      <div className="weft-event-section">
        <span className="weft-hint-label">Wird ausgelöst durch</span>
        <p className="weft-hint">{EVENT_HINTS[node.eventType] ?? "Passiert durch Interaktion der Lernperson."}</p>
      </div>
    );
  }

  const incoming = incomingTriggers(page.timeline, node.id);
  // Everything that can cause something - but not the event itself.
  const options = listPageTriggerEvents(page).filter((e) => e.id !== node.id);
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? id;

  return (
    <Collapsible title="Wird ausgelöst durch" defaultOpen>
      {incoming.length === 0 ? (
        <p className="weft-hint">Nichts - dieses Ereignis passiert nie.</p>
      ) : (
        <ul className="weft-trigger-list">
          {incoming.map((trigger) => (
            <TriggerCard
              key={trigger.id}
              page={page}
              triggerId={trigger.id}
              endpoint={trigger.from}
              endpointLabel={labelOf(trigger.from)}
              options={options}
              delayMs={trigger.delayMs}
              weiter={trigger.weiter}
              loop={!canTriggerFrom(page, trigger.from, node.id) && trigger.from !== "start"}
              onEndpoint={(from) => updateTrigger(page.id, trigger.id, { from })}
            />
          ))}
        </ul>
      )}
      <button type="button" className="weft-ghost-button weft-full-width" onClick={() => addTrigger(page.id, "start", node.id, 0, true)}>
        + Auslöser
      </button>
    </Collapsible>
  );
}

/** "Löst aus": every trigger that starts at this event. Not for "Nächste Folie" - the slide is already gone by the time it fires. */
function OutgoingTriggersSection({ page, node }: { page: Page; node: TimelineNode }) {
  const select = useDocumentStore((s) => s.select);
  const { t } = useTranslation();
  if (node.kind === "end") return null;

  const outgoing = outgoingTriggers(page.timeline, node.id);
  // What can be caused: Aufbau, Abbau, a video's start, and every "Nächste Folie".
  const options = [
    ...listTriggerableNodes(page),
    ...endNodeIds(page).map((id) => ({ id, label: page.timeline.titles?.[id]?.trim() || nodeLabel({ id, kind: "end" }) })),
  ].filter((target) => target.id !== node.id);
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? id;
  const addable = options.filter((target) => !outgoing.some((o) => o.to === target.id));

  return (
    <Collapsible title="Löst aus" defaultOpen={outgoing.length > 0}>
      {outgoing.length === 0 ? (
        <p className="weft-hint">Löst noch nichts aus.</p>
      ) : (
        <ul className="weft-trigger-list">
          {outgoing.map((trigger) => {
            return (
              <TriggerCard
                key={trigger.id}
                page={page}
                triggerId={trigger.id}
                endpoint={trigger.to}
                endpointLabel={labelOf(trigger.to)}
                options={options}
                delayMs={trigger.delayMs}
                weiter={trigger.weiter}
                loop={!canTriggerFrom(page, node.id, trigger.to) && node.id !== "start"}
                onEndpoint={(to) => updateTrigger(page.id, trigger.id, { to })}
              />
            );
          })}
        </ul>
      )}
      {outgoing.some((o) => page.blocks[findNode(page, o.to)?.sourceBlockId ?? ""]) && (
        <div className="weft-event-source">
          <span className="weft-hint">Ziele öffnen</span>
          {outgoing.map((trigger) => {
            const targetBlock = page.blocks[findNode(page, trigger.to)?.sourceBlockId ?? ""];
            return (
              targetBlock && (
                <button
                  key={trigger.id}
                  type="button"
                  className="weft-event-trigger-row"
                  onClick={() => select({ type: "block", container: { kind: "page", pageId: page.id }, blockId: targetBlock.id })}
                >
                  <span>{labelOf(trigger.to)}</span>
                  <span className="weft-event-trigger-via">{t(BLOCK_KIND_KEYS[targetBlock.kind])}</span>
                </button>
              )
            );
          })}
        </div>
      )}
      {addable.length > 0 && (
        <label className="weft-field">
          <span>Weiteres Ziel hinzufügen</span>
          <select value="" onChange={(e) => e.target.value && addTrigger(page.id, node.id, e.target.value, 0, false)}>
            <option value="" disabled>
              Ereignis wählen…
            </option>
            {addable.map((target) => (
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
