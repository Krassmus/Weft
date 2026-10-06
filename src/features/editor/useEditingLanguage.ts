import { defaultLanguageOf, effectiveLanguage } from "../../core/document/translations";
import { useDocumentStore } from "../../core/document/store";

/**
 * The language texts are shown and edited in right now: the one picked with a language switch in
 * the sidebar, or the module's default when none was (or the picked one isn't offered any more).
 * `lang` is null for a module without languages - then texts are simply the blocks' own fields.
 * `languages` has more than one entry exactly when a switch makes sense.
 */
export function useEditingLanguage(): { lang: string | null; defaultLang: string | null; languages: string[] } {
  const languages = useDocumentStore((s) => s.doc.content.languages);
  const wanted = useDocumentStore((s) => s.editingLanguage);
  return { lang: effectiveLanguage(languages, wanted), defaultLang: defaultLanguageOf(languages), languages };
}
