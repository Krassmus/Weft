import { renderLanguage } from "../../../core/blocks/language/render.js";
import type { LanguageRenderContext, LanguageRenderProps } from "../../../core/blocks/language/render.js";
import { useDocumentStore } from "../../../core/document/store";
import { autonymLabel } from "../../../core/i18n/languages";
import { playerStringsFor } from "../../../core/i18n/playerStrings";
import { RenderHost } from "./RenderHost";

/**
 * A language switch as it is drawn in the editor - the canvas, the thumbnails and the PDF: by the function the player draws it with (blocks/language/
 * render.js). On the canvas it is the drop-down showing the language the editor shows (a picture: it cannot be used); elsewhere a grey box with a globe.
 */
export function LanguageView({ lang, mode }: { lang: string | null; mode: LanguageRenderContext["mode"] }) {
  const languages = useDocumentStore((s) => s.doc.content.languages);
  const strings = playerStringsFor(lang) as unknown as Record<string, string>;
  const props: LanguageRenderProps = {
    languages,
    labels: Object.fromEntries(languages.map((locale) => [locale, autonymLabel(locale)])),
    current: lang ?? "",
  };
  const ctx: LanguageRenderContext = { mode, text: (key) => strings[key] ?? "", setLanguage: () => {} };
  return <RenderHost render={renderLanguage} props={props} ctx={ctx} />;
}
