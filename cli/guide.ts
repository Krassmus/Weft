import authoringDe from "../docs/ai-authoring.md?raw";
import authoringEn from "../docs/ai-authoring.en.md?raw";
import cliDe from "../docs/cli.md?raw";
import cliEn from "../docs/cli.en.md?raw";
import operationsDe from "../docs/operations.md?raw";
import operationsEn from "../docs/operations.en.md?raw";

/**
 * The guides that go with the tool (`weft guide`, the MCP tool weft_guide): the same files as in docs/, built into the program - so that
 * whoever (or whatever) has only the program finds out how to use it. English is the default (the guides of the repo are written in both).
 */

export type GuideTopic = "authoring" | "cli" | "ops";
export type GuideLanguage = "en" | "de";

export const GUIDE_TOPICS: { topic: GuideTopic; about: Record<GuideLanguage, string> }[] = [
  { topic: "authoring", about: { en: "How to build a learning module that looks good and works (start here)", de: "Wie man ein Lernmodul baut, das gut aussieht und funktioniert (hier anfangen)" } },
  { topic: "ops", about: { en: "The operations of `weft edit` with parameters and an example", de: "Die Operationen von `weft edit` mit Parametern und einem Beispiel" } },
  { topic: "cli", about: { en: "Every command of `weft` in detail", de: "Jeder Befehl von `weft` im Einzelnen" } },
];

const TEXTS: Record<GuideTopic, Record<GuideLanguage, string>> = {
  authoring: { en: authoringEn, de: authoringDe },
  cli: { en: cliEn, de: cliDe },
  ops: { en: operationsEn, de: operationsDe },
};

export function isGuideTopic(value: string): value is GuideTopic {
  return value in TEXTS;
}

export function guideLanguage(value: unknown): GuideLanguage {
  return value === "de" ? "de" : "en";
}

export function guideText(topic: GuideTopic, language: GuideLanguage): string {
  return TEXTS[topic][language];
}

/** The list of topics, as text. */
export function guideTopicList(language: GuideLanguage): string {
  const lines = GUIDE_TOPICS.map(({ topic, about }) => `  ${topic.padEnd(10)} ${about[language]}`);
  return (language === "de" ? "Themen von `weft guide <Thema>` (`--lang de|en`):\n" : "Topics of `weft guide <topic>` (`--lang en|de`):\n") + lines.join("\n");
}
