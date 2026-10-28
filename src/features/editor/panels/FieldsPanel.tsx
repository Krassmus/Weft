import { descriptorOf } from "../../../core/blocks/registry";
import type { FieldSpec, FieldUi } from "../../../core/blocks/types";
import { setQuizAdvance } from "../../../core/document/actions";
import { useDocumentStore } from "../../../core/document/store";
import { fieldWording, fieldWordingPatch } from "../../../core/document/translations";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import { tr } from "../../../core/i18n/tr";
import { quizEndNodeId } from "../../../core/document/pageTimeline";
import type { Block, Page, VariableEffect } from "../../../core/types";
import { Collapsible } from "../Collapsible";
import { useEditingLanguage } from "../useEditingLanguage";
import { EffectListEditor } from "./EffectListEditor";
import { LanguageSelect } from "./LanguageSelect";

/**
 * The panel of a block that describes itself (see blocks/registry.ts), made from its fields: the sections of its `panel`, in that order, with a
 * control for each field by the field's type - a text (in the language being edited, when the field is translatable), a flag, a number the author
 * may leave unset, and the changes to variables that happen at an outcome of the block's task (with the way on to the next slide).
 */
export function FieldsPanel({ block, page, onUpdate }: { block: Block; page?: Page; onUpdate: (patch: Partial<Block>) => void }) {
  const descriptor = descriptorOf(block);
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();
  if (!descriptor) return null;
  const record = block as unknown as Record<string, unknown>;
  const goesOn = (outcome: "richtig" | "falsch") => !!page?.timeline.ends[quizEndNodeId(block.id, outcome)];

  const control = (name: string, spec: FieldSpec) => {
    const ui: FieldUi | undefined = spec.ui;
    if (!ui) return null;
    switch (spec.type) {
      case "text":
        return (
          <label key={name} className="weft-field">
            <span>{tr(ui.label)}</span>
            <input
              value={spec.translatable ? fieldWording(block, name, lang, defaultLang) : ((record[name] as string | undefined) ?? "")}
              {...(ui.plain ? { autoComplete: "off", spellCheck: false } : {})}
              {...(ui.placeholderString ? { placeholder: (playerStringsFor(lang) as unknown as Record<string, string>)[ui.placeholderString] } : {})}
              onChange={(e) => onUpdate(spec.translatable ? fieldWordingPatch(block, name, lang, defaultLang, e.target.value) : ({ [name]: e.target.value } as Partial<Block>))}
            />
          </label>
        );
      case "bool":
        return (
          <div key={name}>
            <label className="weft-field weft-field-inline">
              <input type="checkbox" checked={record[name] === true} onChange={(e) => onUpdate({ [name]: e.target.checked ? true : undefined } as Partial<Block>)} />
              <span>{tr(ui.label)}</span>
            </label>
            {record[name] === true && ui.hint && <p className="weft-hint">{tr(ui.hint)}</p>}
          </div>
        );
      case "int": {
        const min = spec.min ?? 0;
        const value = record[name] as number | undefined;
        const set = value !== undefined && value >= min;
        return (
          <div key={name}>
            <label className="weft-field">
              <span>{tr(ui.label)}</span>
              <select value={set ? "set" : "unset"} onChange={(e) => onUpdate({ [name]: e.target.value === "set" ? min : undefined } as Partial<Block>)}>
                <option value="unset">{ui.unsetLabel && tr(ui.unsetLabel)}</option>
                <option value="set">{ui.setLabel && tr(ui.setLabel)}</option>
              </select>
            </label>
            {set && (
              <label className="weft-field">
                <span>{ui.countLabel && tr(ui.countLabel)}</span>
                <input
                  type="number"
                  min={min}
                  step={1}
                  value={value}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    if (Number.isFinite(n) && n >= min) onUpdate({ [name]: n } as Partial<Block>);
                  }}
                />
              </label>
            )}
            {set && ui.hint && <p className="weft-hint">{tr(ui.hint)}</p>}
          </div>
        );
      }
      case "effects": {
        const outcome = spec.firesOn;
        return (
          <div key={name}>
            <EffectListEditor effects={(record[name] as VariableEffect[] | undefined) ?? []} variables={variables} onChange={(effects) => onUpdate({ [name]: effects } as Partial<Block>)} />
            <label className="weft-field weft-field-inline">
              <input type="checkbox" checked={goesOn(outcome)} disabled={!page} onChange={(e) => page && setQuizAdvance(page.id, block.id, outcome, e.target.checked)} />
              <span>{tr("ui.continue_to_the_next_slide")}</span>
            </label>
            {goesOn(outcome) && ui.advanceHint && <p className="weft-hint">{tr(ui.advanceHint)}</p>}
          </div>
        );
      }
    }
  };

  return (
    <>
      {descriptor.panel.sections.map((section) => (
        <Collapsible key={section.title} title={tr(section.title)} defaultOpen={section.open ?? true}>
          {section.hint && <p className="weft-hint">{tr(section.hint)}</p>}
          {section.language && <LanguageSelect block={block as Parameters<typeof LanguageSelect>[0]["block"]} />}
          {section.fields.map((name) => {
            const spec = (descriptor.fields as Record<string, FieldSpec | undefined>)[name];
            return spec ? control(name, spec) : null;
          })}
        </Collapsible>
      ))}
    </>
  );
}
