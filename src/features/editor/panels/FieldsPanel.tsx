import { useState } from "react";
import { descriptorOf, itemTextName } from "../../../core/blocks/registry";
import type { FieldSpec, FieldUi, ListField } from "../../../core/blocks/types";
import { useAssetStore } from "../../../core/assets/assetStore";
import { setQuizAdvance } from "../../../core/document/actions";
import { addListAssets, setListItemAsset } from "../../../core/document/filesActions";
import type { BlockContainerRef } from "../../../core/document/store";
import { useDocumentStore } from "../../../core/document/store";
import { fieldWording, fieldWordingPatch, itemWording, itemWordingPatch } from "../../../core/document/translations";
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
export function FieldsPanel({ block, container, page, onUpdate }: { block: Block; container: BlockContainerRef; page?: Page; onUpdate: (patch: Partial<Block>) => void }) {
  const descriptor = descriptorOf(block);
  const variables = useDocumentStore((s) => s.doc.content.variables);
  const { lang, defaultLang } = useEditingLanguage();
  const [error, setError] = useState("");
  if (!descriptor?.panel) return null;
  const record = block as unknown as Record<string, unknown>;
  const goesOn = (outcome: "richtig" | "falsch") => !!page?.timeline.ends[quizEndNodeId(block.id, outcome)];

  async function run(task: Promise<void>) {
    setError("");
    try {
      await task;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const control = (name: string, spec: FieldSpec) => {
    if (spec.type === "asset") return null;
    if (spec.type === "list") return listControl(name, spec);
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

  // The items of a list in rows - the file (a thumbnail and a button), the words, and the buttons that order and remove them - and the button that adds files.
  const listControl = (name: string, spec: ListField) => {
    const ui = spec.ui;
    if (!ui) return null;
    const items = (record[name] as ({ id: string } & Record<string, unknown>)[] | undefined) ?? [];
    const textName = itemTextName(spec);
    const assetName = Object.entries(spec.item).find(([, itemSpec]) => itemSpec.type === "asset")?.[0];
    const removeItem = (id: string) => {
      const translations = (block as { translations?: Record<string, { items?: Record<string, string> }> }).translations;
      const cleaned = translations
        ? Object.fromEntries(Object.entries(translations).map(([language, t]) => [language, t.items ? { ...t, items: Object.fromEntries(Object.entries(t.items).filter(([key]) => key !== id)) } : t]))
        : undefined;
      onUpdate({ [name]: items.filter((item) => item.id !== id), ...(cleaned ? { translations: cleaned } : {}) } as Partial<Block>);
    };
    const move = (index: number, step: -1 | 1) => {
      const next = [...items];
      const to = index + step;
      if (to < 0 || to >= next.length) return;
      [next[index], next[to]] = [next[to], next[index]];
      onUpdate({ [name]: next } as Partial<Block>);
    };
    return (
      <div key={name}>
        {items.length === 0 && <p className="weft-hint">{tr(ui.empty)}</p>}
        {items.map((item, index) => (
          <div key={item.id} className="weft-matching-row">
            <div className="weft-matching-row-head">
              {assetName && <ItemThumb assetId={(item[assetName] as string | null) ?? null} />}
              <button type="button" className="weft-icon-button" title={tr(ui.moveUp)} aria-label={tr(ui.moveUp)} disabled={index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button type="button" className="weft-icon-button" title={tr(ui.moveDown)} aria-label={tr(ui.moveDown)} disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                ↓
              </button>
              <button type="button" className="weft-icon-button" title={tr(ui.remove)} aria-label={tr(ui.remove)} onClick={() => removeItem(item.id)}>
                ×
              </button>
            </div>
            {textName && (
              <input
                value={itemWording(block, name, item.id, lang, defaultLang)}
                placeholder={tr(ui.textLabel)}
                aria-label={tr(ui.textLabel)}
                onChange={(e) => onUpdate(itemWordingPatch(block, name, item.id, lang, defaultLang, e.target.value))}
              />
            )}
            {assetName && (
              <label className="weft-ghost-button weft-full-width weft-matching-file">
                {item[assetName] ? tr(ui.change) : tr(ui.choose)}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void run(setListItemAsset(container, block.id, name, item.id, file));
                  }}
                />
              </label>
            )}
          </div>
        ))}
        <label className="weft-ghost-button weft-full-width weft-matching-file">
          {tr(ui.add)}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length > 0) void run(addListAssets(container, block.id, name, files));
            }}
          />
        </label>
        {error && <p className="weft-placeholder-warning">{error}</p>}
      </div>
    );
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

function ItemThumb({ assetId }: { assetId: string | null }) {
  const getObjectUrl = useAssetStore((s) => s.getObjectUrl);
  const src = assetId ? getObjectUrl(assetId) : undefined;
  return <span className="weft-gallery-thumb">{src && <img src={src} alt="" draggable={false} />}</span>;
}
