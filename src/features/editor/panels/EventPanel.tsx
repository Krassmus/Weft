import { addTrigger, setConditionTrigger, setEventTitle, setGroupEffect, updateBlock, updateTrigger } from "../../../core/document/actions";
import {
  actionEffectAdvanceSource,
  canTriggerActionEffectFrom,
  canTriggerFrom,
  findNode,
  getBlockEntranceTrigger,
  getBlockExitTrigger,
  incomingTriggers,
  isTriggerableNode,
} from "../../../core/document/pageTimeline";
import { useDocumentStore } from "../../../core/document/store";
import { formulaProblem } from "../../../core/document/variables";
import { virtualVariableNamesFor } from "../../../core/document/virtualVariables";
import { BLOCK_KIND_KEYS } from "../../../core/i18n/translations";
import { useTranslation } from "../../../core/i18n/useTranslation";
import type { Page, TimelineEventType, TimelineNode } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { buildGraphModel } from "../eventGraph/model";
import { listPageTriggerEvents, nodeLabel } from "../Timeline";
import { BlockEffectEditor } from "./BlockPanel";
import { ActionEffectCard } from "./ActionEffectsEditor";
import { FormulaInput } from "./VariablesTab";
import { OutgoingTriggersSection, TriggerCard, resumableBlock } from "./TriggerSections";
import { TransitionPanel } from "./TransitionPanel";
import { tr } from "../../../core/i18n/tr";

// Purely descriptive, for every event that ISN'T in TRIGGERABLE_EVENT_TYPES (document/
// pageTimeline.ts) and so gets no editable "Wird ausgelöst durch" of its own (see
// IncomingTriggersSection below) - each only ever happens through genuine learner interaction or
// real playback time that nothing could fake, so there's nothing here to edit, just to explain.
const EVENT_HINTS: Partial<Record<TimelineEventType, string>> = {
  get "button-click"() { return tr("ui.happens_as_soon_as_the_learner"); },
  get "revealer-button"() { return tr("ui.revealer_button_hint"); },
  get "quiz-fill-start"() { return tr("ui.happens_as_soon_as_the_learner_2"); },
  get "quiz-submit"() { return tr("ui.happens_as_soon_as_the_quiz"); },
  get "quiz-submit-correct"() { return tr("ui.happens_as_soon_as_the_quiz_2"); },
  get "quiz-submit-incorrect"() { return tr("ui.happens_as_soon_as_the_quiz_3"); },
  get "video-stop-point"() { return tr("ui.happens_as_soon_as_playback_reaches"); },
  get "video-resume"() { return tr("ui.happens_as_soon_as_the_learner_3"); },
  get "video-end-loop"() { return tr("ui.never_happens_the_video_runs_in"); },
  get "video-end-stop"() { return tr("ui.happens_as_soon_as_the_video"); },
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
 *
 * A node of the graph can show more than one event (see foldCompanions in eventGraph/model.ts): selecting it lists all of them, one
 * below the other, each with everything above.
 */
export function EventPanel({ page, nodeId }: { page: Page; nodeId: string }) {
  const model = buildGraphModel(page);
  const primary = model.nodes.find((n) => n.id === (model.shownIn.get(nodeId) ?? nodeId));
  const ids = primary ? [primary.id, ...primary.companions.map((c) => c.id)] : [nodeId];
  return (
    <>
      {ids.map((id, index) => (
        <div key={id} className={index > 0 ? "weft-event-bundle-member" : undefined}>
          <SingleEventPanel page={page} nodeId={id} />
        </div>
      ))}
    </>
  );
}

function SingleEventPanel({ page, nodeId }: { page: Page; nodeId: string }) {
  const select = useDocumentStore((s) => s.select);
  const { t } = useTranslation();
  const rawNode = findNode(page, nodeId);

  if (!rawNode) {
    return (
      <div className="weft-inspector-empty">
        <p>{tr("ui.this_event_no_longer_exists")}</p>
      </div>
    );
  }

  // A non-stopping stop point showing its one child inline (see TimelineNode.inlineChild) is selected by its own real id, but
  // everything below should describe and edit the CHILD it stands in for.
  const node = rawNode.inlineChild && rawNode.children?.length === 1 ? rawNode.children[0].node : rawNode;

  const sourceBlock = node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;
  const sourceGroup = node.sourceGroupId ? page.groups.find((g) => g.id === node.sourceGroupId) : undefined;
  // Nothing can make it happen (see docs/event-graph.md): shown red in the graph, and said here.
  const unreachable =
    buildGraphModel(page)
      .nodes.flatMap((n) => [n, ...n.companions])
      .find((n) => n.id === node.id)?.unreachable ?? false;

  return (
    <>
      <div className="weft-event-heading">
        <span className="weft-event-heading-kind">{tr("ui.event")}</span>
        <EventTitleInput page={page} node={node} />
        {node.kind === "start" && <p className="weft-hint">{tr("ui.happens_automatically_as_soon_as_this")}</p>}
      </div>

      {node.problem && (
        <div className="weft-placeholder-warning">
          <p>{node.problem === "before-entrance" ? tr("ui.action_problem_before") : tr("ui.action_problem_after")}</p>
        </div>
      )}

      {unreachable && (
        <div className="weft-placeholder-warning">
          <p>
            {tr("ui.nothing_triggers_this_event_it_never")}
            {node.kind === "end" ? tr("ui.slide_only_left_another_way") : ""}
          </p>
        </div>
      )}

      {sourceBlock && (
        <div className="weft-event-source">
          <span className="weft-hint">{tr("ui.belongs_to")}</span>
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
          <span className="weft-hint">{tr("ui.belongs_to")}</span>
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

/** The title of the event, as the heading of the panel and editable in place: empty keeps the standard one (shown the same, as the
 * placeholder). The title is trimmed when the field is left - while typing, "Mein " has to stay "Mein ". */
function EventTitleInput({ page, node }: { page: Page; node: TimelineNode }) {
  return (
    <input
      className="weft-event-heading-title"
      aria-label={tr("ui.title_of_the_event")}
      value={page.timeline.titles?.[node.id] ?? ""}
      placeholder={nodeLabel(node)}
      onChange={(e) => setEventTitle(page.id, node.id, e.target.value)}
      onBlur={(e) => {
        const stored = page.timeline.titles?.[node.id];
        if (stored !== undefined && stored !== stored.trim()) setEventTitle(page.id, node.id, e.target.value.trim());
      }}
    />
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
        title={phase === "entrance" ? tr("ui.entrance") : tr("ui.exit")}
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
  // An Aktionseffekt: what it does (its trigger is listed below).
  if (sourceBlock && node.eventType?.startsWith("block-action")) {
    const effectId = node.id.split(":")[2];
    const index = (sourceBlock.actionEffects ?? []).findIndex((e) => e.id === effectId);
    const effect = sourceBlock.actionEffects?.[index];
    if (!effect) return null;
    return <ActionEffectCard key={node.id} block={sourceBlock} page={page} effect={effect} index={index} events={[]} hideTrigger />;
  }
  if (!sourceBlock || (node.eventType !== "block-entrance" && node.eventType !== "block-exit" && node.eventType !== "list-item-entrance")) return null;
  // An item of a list appears with the effect of the list's Aufbau - the same for every item.
  const phase = node.eventType === "block-exit" ? "exit" : "entrance";
  return (
    <BlockEffectEditor
      key={node.id}
      title={phase === "entrance" ? tr("ui.entrance") : tr("ui.exit")}
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

/** The condition of a variable ("Ausgelöst durch: Variable", see PageTimeline.conditions) as an event of its own: what makes it happen is its formula. */
function ConditionSection({ page, node }: { page: Page; node: TimelineNode }) {
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const languages = useDocumentStore((s) => s.doc.content.languages);
  const formula = page.timeline.conditions?.[node.id] ?? "";
  const problem = formula.trim() === "" ? null : formulaProblem(formula, variables, virtualVariableNamesFor(languages));
  return (
    <div className="weft-event-section">
      <span className="weft-hint-label">{tr("ui.is_triggered_by")}</span>
      <div className="weft-field">
        <span>{tr("ui.condition_formula")}</span>
        <FormulaInput
          value={formula}
          placeholder={tr("ui.condition_placeholder")}
          invalid={problem !== null}
          // (The formula is stored for the event it triggers first - the id of the condition holds it: conditionNodeId.)
          onCommit={(next) => setConditionTrigger(page.id, node.id.slice("condition:".length), next)}
        />
        {problem && <p className="weft-variable-problem">⚠ {problem}</p>}
        <p className="weft-hint">{tr("ui.condition_hint")}</p>
      </div>
    </div>
  );
}

/** "Wird ausgelöst durch": every trigger that leads to this event (any one is enough to make it happen). Not for "start", and
 * for events only the learner or playback can cause just a description. */
function IncomingTriggersSection({ page, node }: { page: Page; node: TimelineNode }) {
  if (node.kind === "start") return null;
  if (node.eventType === "variable-condition") return <ConditionSection page={page} node={node} />;

  if (node.kind === "event" && node.eventType && !isTriggerableNode(node)) {
    return (
      <div className="weft-event-section">
        <span className="weft-hint-label">{tr("ui.is_triggered_by")}</span>
        <p className="weft-hint">{EVENT_HINTS[node.eventType] ?? tr("ui.happens_through_the_learner_s_interaction")}</p>
      </div>
    );
  }

  const incoming = incomingTriggers(page.timeline, node.id);
  // Everything that can cause something - but not the event itself.
  const actionBlock = node.eventType?.startsWith("block-action") && node.sourceBlockId ? page.blocks[node.sourceBlockId] : undefined;
  const actionEffectId = actionBlock ? node.id.split(":")[2] : "";
  // An Aktionseffekt takes nothing from before its block's Aufbau or after its Abbau (the one that is stored stays listed: see TriggerCard).
  const options = listPageTriggerEvents(page).filter((e) => e.id !== node.id && (!actionBlock || canTriggerActionEffectFrom(page, actionBlock, actionEffectId, e.id)));
  const labelOf = (id: string) => options.find((o) => o.id === id)?.label ?? id;

  return (
    <Collapsible title={tr("ui.is_triggered_by")} defaultOpen>
      {incoming.length === 0 ? (
        <p className="weft-hint">{tr("ui.nothing_this_event_never_happens")}</p>
      ) : (
        <ul className="weft-trigger-list">
          {incoming.map((trigger) => (
            <TriggerCard
              key={trigger.id}
              page={page}
              triggerId={trigger.id}
              direction="incoming"
              endpoint={trigger.from}
              endpointLabel={labelOf(trigger.from)}
              options={options}
              delayMs={trigger.delayMs}
              weiter={trigger.weiter}
              loop={!canTriggerFrom(page, trigger.from, node.id) && trigger.from !== "start"}
              resumable={resumableBlock(page, trigger.from, trigger.to) ?? undefined}
              onEndpoint={(from) => updateTrigger(page.id, trigger.id, { from })}
            />
          ))}
        </ul>
      )}
      <button type="button" className="weft-ghost-button weft-full-width" onClick={() =>
          actionBlock ? addTrigger(page.id, actionEffectAdvanceSource(page, actionBlock, actionEffectId), node.id, 0, true) : addTrigger(page.id, "start", node.id, 0, true)
        }>
        {tr("ui.trigger")}
      </button>
    </Collapsible>
  );
}

