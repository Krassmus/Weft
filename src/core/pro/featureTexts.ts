import type { TranslationKey } from "../i18n/translations";
import type { ProFeature } from "./types";

/** The line that says in the settings what a feature of Weft Pro is - every feature has one (tests/pro.test.ts looks). */
export const PRO_FEATURE_TEXT: Record<ProFeature, TranslationKey> = {
  turn: "settings.pro.turn",
  cloudDocuments: "settings.pro.cloud",
  cloudBlocks: "settings.pro.blocks",
};
