import { useRef, useState } from "react";
import type { Block, CheckerBlock } from "../../../core/types";
import { checkerText, checkerTextPatch } from "../../../core/document/translations";
import { useEditingLanguage } from "../useEditingLanguage";
import { CheckerView } from "./CheckerView";

/**
 * A checker on the canvas: once the block is selected (before that a press on it moves the block, like with any other), a double click on its words
 * writes them in place - in the editing language, one step of the history; Enter or leaving the field keeps them, Escape drops them.
 */
export function CheckerCanvas({ block, selected, onUpdate }: { block: CheckerBlock; selected: boolean; onUpdate?: (patch: Partial<Block>) => void }) {
  const { lang, defaultLang } = useEditingLanguage();
  const [writing, setWriting] = useState<string | null>(null);
  const writingRef = useRef(writing);
  writingRef.current = writing;
  function commit() {
    const value = writingRef.current;
    setWriting(null);
    writingRef.current = null;
    if (value !== null && onUpdate && value !== checkerText(block, lang, defaultLang)) onUpdate(checkerTextPatch(block, lang, defaultLang, value));
  }
  return (
    <CheckerView
      block={block}
      lang={lang}
      defaultLang={defaultLang}
      onTextDoubleClick={selected && onUpdate ? () => setWriting(checkerText(block, lang, defaultLang)) : undefined}
      editing={
        writing === null
          ? null
          : {
              value: writing,
              onChange: setWriting,
              onCommit: commit,
              onCancel: () => {
                writingRef.current = null;
                setWriting(null);
              },
            }
      }
    />
  );
}
