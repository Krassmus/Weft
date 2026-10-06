import type { Block } from "../types";

/**
 * App-UI strings, in English and German - not document content (a module's own title, slide
 * text, etc. stays whatever language its author wrote it in; this is only the app's own chrome).
 * `en` is the source of truth for which keys exist; `de`'s type is checked against it, so a
 * missing or misspelled key in either language is a build error rather than a silently-blank
 * label at runtime.
 *
 * This first pass covers the sidebar, the elements/layout panel, error alerts, and the new
 * settings window - the chrome you can't avoid seeing - rather than the full app: every panel's
 * field labels, hints, and dialog text is still German-only. Extending coverage just means adding
 * more keys here and swapping the hardcoded strings at their call sites for t("...").
 */

const en = {
  "toolbar.openFailed": "Opening failed:",
  "toolbar.saveFailed": "Saving failed:",
  "toolbar.quitSaveFailedTitle": "Quit without saving?",
  "toolbar.quitSaveFailed": "The latest changes could not be saved. Quit anyway? Unsaved changes will be lost.",
  "toolbar.autosaveFailed": "Automatic saving failed - your latest changes are not saved yet. Trying again in a moment.",
  "toolbar.exportFailed": "Exporting failed:",
  "toolbar.resizerTitle": "Drag to resize the sidebar",

  "sidebar.tab.slides": "Slides",
  "sidebar.tab.layouts": "Layouts",
  "sidebar.tab.variables": "Variables",
  "sidebar.tab.settings": "Settings",

  "panel.element": "Element",
  "panel.elements": "Elements",
  "panel.layout": "Layout",
  "panel.remove": "Remove",
  "panel.layout.hint": "A layout is like a slide, but without interactive elements - it serves as a template for slides.",
  "panel.layout.name": "Name",

  "block.text": "Text",
  "block.language": "Language switch",
  "block.code": "Code",
  "block.tex": "Formula",
  "block.image": "Image",
  "block.video": "Video",
  "block.iframe": "Iframe",
  "block.button": "Button",
  "block.quiz": "Quiz",
  "block.shape": "Shape",

  "settings.window.title": "Settings",
  "settings.language.legend": "Language",
  "settings.language.system": "System Language",
  "settings.language.de": "German",
  "settings.language.en": "English",
  "settings.language.hint": "Changes apply immediately, in every open window.",
  "settings.profile.legend": "Your profile",
  "settings.profile.name": "Name",
  "settings.profile.avatar": "Picture",
  "settings.profile.choose": "Choose picture…",
  "settings.profile.remove": "Remove",
  "settings.profile.error": "This file can't be used as a picture.",
  "settings.profile.hint": "Shown to the people you work with on a module, next to your changes. Stored on this computer only.",
} as const;

const de: Record<keyof typeof en, string> = {
  "toolbar.openFailed": "Öffnen fehlgeschlagen:",
  "toolbar.saveFailed": "Speichern fehlgeschlagen:",
  "toolbar.quitSaveFailedTitle": "Ohne Speichern beenden?",
  "toolbar.quitSaveFailed": "Die letzten Änderungen konnten nicht gespeichert werden. Trotzdem beenden? Nicht gespeicherte Änderungen gehen verloren.",
  "toolbar.autosaveFailed": "Automatisches Speichern fehlgeschlagen - die letzten Änderungen sind noch nicht gesichert. Es wird gleich erneut versucht.",
  "toolbar.exportFailed": "Exportieren fehlgeschlagen:",
  "toolbar.resizerTitle": "Breite der Seitenleiste ziehen",

  "sidebar.tab.slides": "Folien",
  "sidebar.tab.layouts": "Layouts",
  "sidebar.tab.variables": "Variablen",
  "sidebar.tab.settings": "Einstellungen",

  "panel.element": "Element",
  "panel.elements": "Elemente",
  "panel.layout": "Layout",
  "panel.remove": "Entfernen",
  "panel.layout.hint": "Ein Layout ist wie eine Folie, aber ohne interaktive Elemente – es dient als Vorlage für Folien.",
  "panel.layout.name": "Name",

  "block.text": "Text",
  "block.language": "Sprachschalter",
  "block.code": "Code",
  "block.tex": "Formel",
  "block.image": "Bild",
  "block.video": "Video",
  "block.iframe": "Iframe",
  "block.button": "Button",
  "block.quiz": "Quiz",
  "block.shape": "Form",

  "settings.window.title": "Einstellungen",
  "settings.language.legend": "Sprache",
  "settings.language.system": "Systemsprache",
  "settings.language.de": "Deutsch",
  "settings.language.en": "Englisch",
  "settings.language.hint": "Änderungen wirken sofort, in allen offenen Fenstern.",
  "settings.profile.legend": "Dein Profil",
  "settings.profile.name": "Name",
  "settings.profile.avatar": "Bild",
  "settings.profile.choose": "Bild wählen …",
  "settings.profile.remove": "Entfernen",
  "settings.profile.error": "Diese Datei lässt sich nicht als Bild verwenden.",
  "settings.profile.hint": "Wird den Leuten gezeigt, mit denen du an einem Lernmodul arbeitest, neben deinen Änderungen. Wird nur auf diesem Computer gespeichert.",
};

export type TranslationKey = keyof typeof en;
export type Language = "de" | "en";

export const translations: Record<Language, Record<TranslationKey, string>> = { en, de };

/** One shared map from a block's own `kind` to its translation key - PagePanel.tsx,
 * LayoutPanel.tsx and BlockPanel.tsx each need "what do we call this kind of block", and used to
 * each keep their own separate (only-German) copy of that mapping. Keyed off Block["kind"]
 * itself (not a hand-copied literal union) so a future new block kind fails to compile here too,
 * the same way it already would in each of those three files' own label records. */
export const BLOCK_KIND_KEYS: Record<Block["kind"], Extract<TranslationKey, `block.${string}`>> = {
  text: "block.text",
  language: "block.language",
  code: "block.code",
  tex: "block.tex",
  image: "block.image",
  video: "block.video",
  iframe: "block.iframe",
  button: "block.button",
  quiz: "block.quiz",
  shape: "block.shape",
};
