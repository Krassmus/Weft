import {
  addJumpTarget,
  moveJumpTarget,
  removeJumpTarget,
  setJumpDefault,
  updateJumpTarget,
} from "../../../core/document/actions";
import { orderedValues } from "../../../core/document/ordering";
import { pageLabels } from "../../../core/document/pageLabels";
import { useDocumentStore } from "../../../core/document/store";
import { isBooleanVariable } from "../../../core/document/variables";
import type { Page, VariableCondition, WeftModule } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { PageMiniature } from "../PageMiniature";
import { ConditionFields } from "./ConditionFields";

const COMPARATOR_LABELS: Record<VariableCondition["comparator"], string> = { eq: "=", neq: "≠", gt: ">", gte: "≥", lt: "<", lte: "≤" };

/** The first words of a page's text, to tell pages apart by in a list. */
function pageTitle(page: Page): string {
  for (const block of orderedValues(page.blocks)) {
    if (block.kind !== "text") continue;
    const div = document.createElement("div");
    div.innerHTML = block.html;
    const text = (div.textContent ?? "").trim().replace(/\s+/g, " ");
    if (text) return text.length > 28 ? `${text.slice(0, 27)}…` : text;
  }
  return "";
}

/** The pages a jump can lead to (every page that is not a jump page itself), in the order of the sidebar. */
function targetChoices(content: WeftModule): { pageId: string; label: string }[] {
  const labels = pageLabels(content);
  return Object.entries(labels)
    .filter(([pageId]) => content.pages[pageId] && !content.pages[pageId].jump)
    .map(([pageId, label]) => {
      const title = pageTitle(content.pages[pageId]);
      return { pageId, label: title ? `${label} · ${title}` : label };
    });
}

function conditionText(content: WeftModule, condition: VariableCondition): string {
  const variable = content.variables.find((v) => v.id === condition.variableId);
  const value = variable && isBooleanVariable(variable) ? (condition.value === true || condition.value === "true" ? "Ja" : "Nein") : String(condition.value);
  return `${variable?.name ?? "?"} ${COMPARATOR_LABELS[condition.comparator]} ${value}`;
}

/** A choice of the page to jump to, with that page as a small picture next to it. */
function TargetSelect({ value, onChange, optional }: { value: string | null; onChange: (pageId: string | null) => void; optional?: boolean }) {
  const content = useDocumentStore((s) => s.doc.content);
  const choices = targetChoices(content);
  const known = value === null || choices.some((c) => c.pageId === value);
  return (
    <div className="weft-jump-target">
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        {optional && <option value="">– weiter wie gewohnt –</option>}
        {!known && <option value={value ?? ""}>(gelöschte Folie)</option>}
        {!optional && value === "" && <option value="">Folie wählen …</option>}
        {choices.map((c) => (
          <option key={c.pageId} value={c.pageId}>
            {c.label}
          </option>
        ))}
      </select>
      {value ? (
        <div className="weft-jump-miniature">
          <PageMiniature pageId={value} />
        </div>
      ) : null}
    </div>
  );
}

export function JumpPanel({ page }: { page: Page }) {
  const content = useDocumentStore((s) => s.doc.content);
  const jump = page.jump;
  if (!jump) return null;
  const choices = targetChoices(content);

  return (
    <>
      <Collapsible title="Sprungfolie">
        <p className="weft-hint">
          Diese Folie wird nicht gezeigt: Wer sie erreicht, wird sofort weitergeleitet. Die Bedingungen werden von oben nach unten geprüft; die erste, die zutrifft, bestimmt das Ziel. Trifft keine zu, geht es zum Standardziel.
          Danach läuft das Lernmodul von dort aus normal weiter.
        </p>
      </Collapsible>

      {jump.targets.map((target, index) => (
        <Collapsible key={target.id} title={`${index + 1}. Wenn ${conditionText(content, target.condition)}`}>
          <ConditionFields condition={target.condition} onChange={(patch) => updateJumpTarget(page.id, target.id, { condition: patch })} />
          <span className="weft-field-label">springe zu</span>
          <TargetSelect value={target.pageId} onChange={(pageId) => pageId && updateJumpTarget(page.id, target.id, { pageId })} />
          <div className="weft-jump-actions">
            <button type="button" className="weft-ghost-button" disabled={index === 0} onClick={() => moveJumpTarget(page.id, target.id, -1)}>
              ↑ Früher prüfen
            </button>
            <button type="button" className="weft-ghost-button" disabled={index === jump.targets.length - 1} onClick={() => moveJumpTarget(page.id, target.id, 1)}>
              ↓ Später prüfen
            </button>
            <button type="button" className="weft-ghost-button" onClick={() => removeJumpTarget(page.id, target.id)}>
              Entfernen
            </button>
          </div>
        </Collapsible>
      ))}

      <button
        type="button"
        className="weft-ghost-button weft-full-width"
        disabled={choices.length === 0}
        onClick={() => addJumpTarget(page.id, choices[0].pageId)}
      >
        + Bedingung
      </button>

      <Collapsible title="Sonst (Standardziel)">
        <p className="weft-hint">Hierhin geht es, wenn keine der Bedingungen zutrifft. Ohne Ziel wird die Sprungfolie einfach übergangen.</p>
        <TargetSelect value={jump.defaultPageId} optional onChange={(pageId) => setJumpDefault(page.id, pageId)} />
      </Collapsible>
    </>
  );
}

/** What the canvas shows for a jump page instead of a slide: the ways out as a list, each with the page it leads to. */
export function JumpOverview({ page }: { page: Page }) {
  const content = useDocumentStore((s) => s.doc.content);
  const labels = pageLabels(content);
  const jump = page.jump;
  if (!jump) return null;
  const row = (key: string, heading: string, pageId: string | null) => (
    <li key={key} className="weft-jump-row">
      <span className="weft-jump-row-text">{heading}</span>
      <span className="weft-jump-row-arrow">→</span>
      {pageId ? (
        <div className="weft-jump-row-target">
          <PageMiniature pageId={pageId} />
          <span>{labels[pageId] ?? "?"}</span>
        </div>
      ) : (
        <span className="weft-jump-row-none">weiter wie gewohnt</span>
      )}
    </li>
  );
  return (
    <div className="weft-jump-overview">
      <h3>Sprungfolie</h3>
      <p className="weft-hint">Wird nicht gezeigt – leitet sofort weiter.</p>
      <ol>
        {jump.targets.map((target, index) => row(target.id, `${index + 1}. Wenn ${conditionText(content, target.condition)}`, target.pageId))}
        {row("default", "Sonst", jump.defaultPageId)}
      </ol>
    </div>
  );
}
