import { describe, expect, it } from "vitest";
import { loadWeft } from "../cli/load";
import { validate } from "../cli/validate";
import type { QuizBlock } from "../src/core/types";

/**
 * The quiz game that ships as an example (src/start-content/examples/quizspiel.weft, made by scripts/build-example-quizspiel.mjs): the file is a valid module in
 * both languages, and the library that holds its jokers and its ending does what the game says - tried here with stand-ins for what the player gives a logic
 * block's code (`vars`, `getBlock`, `jump`).
 */
const loaded = loadWeft("src/start-content/examples/quizspiel.weft");
const content = loaded.content;
const pages = Object.values(content.pages);

type Vars = Record<string, unknown>;
type Option = { id: string; index: number; text: string; correct: boolean; hidden: boolean };
const libraryCode = (content.scriptLibraries ?? []).map((library) => library.code).join("\n");
const library = new Function(`${libraryCode}\nreturn { wwnmFiftyFifty, wwnmAudience, wwnmPhone, wwnmAnswered, wwnmQuit, wwnmEnd, wwnmSafe, wwnmMoney };`)() as {
  wwnmFiftyFifty(vars: Vars, getBlock: (name: string) => unknown): void;
  wwnmAudience(vars: Vars, getBlock: (name: string) => unknown): void;
  wwnmPhone(vars: Vars, getBlock: (name: string) => unknown): void;
  wwnmAnswered(vars: Vars, jump: (label: string, type?: string) => void): void;
  wwnmQuit(vars: Vars, jump: (label: string, type?: string) => void): void;
  wwnmEnd(vars: Vars): void;
  wwnmSafe(level: number): number;
  wwnmMoney(vars: Vars, amount: number): string;
};

/** What getBlock("Frage") tells for a question of four answers: A is the right one; `hidden` follows hideOptions. */
const questionStub = () => {
  const hidden = new Set<string>();
  const options: Option[] = ["A", "B", "C", "D"].map((letter, index) => ({
    id: `o${index}`,
    index,
    text: `${letter}: Antwort`,
    correct: index === 0,
    get hidden() {
      return hidden.has(`o${index}`);
    },
  })) as Option[];
  const block = {
    options,
    correctOptions: options.filter((option) => option.correct),
    wrongOptions: options.filter((option) => !option.correct),
    get visibleOptions() {
      return options.filter((option) => !option.hidden);
    },
    hideOptions(which: (Option | string)[]) {
      for (const item of which) hidden.add(typeof item === "string" ? item : item.id);
    },
  };
  return { block, getBlock: (name: string) => (name === "Frage" ? block : null), hidden };
};

describe("the quiz game that comes with Weft", () => {
  it("is a valid module in German and English: nothing to report, every text translated", () => {
    expect(validate(loaded)).toEqual([]);
    expect(content.languages).toEqual(["de_DE", "en_US"]);
  });

  it("has a start, fifteen required questions with one right answer of four, and an ending", () => {
    const quizzes = pages.flatMap((page) => Object.values(page.blocks).filter((block): block is QuizBlock => block.kind === "quiz"));
    expect(pages.length).toBe(17);
    expect(quizzes.length).toBe(15);
    for (const quiz of quizzes) {
      expect(quiz.single, quiz.questionHtml).toBe(true);
      // (A required task: the slide cannot be left without an answer.)
      expect(quiz.required, quiz.questionHtml).toBe(true);
      expect(quiz.options.length).toBe(4);
      expect(quiz.correctOptionIds.length).toBe(1);
      expect(quiz.name).toBe("Frage");
      expect((quiz.translations?.en_US?.options && Object.keys(quiz.translations.en_US.options).length) ?? 0).toBe(4);
    }
  });

  it("has safe levels at questions 5 and 10, and money written the way each language does", () => {
    expect([0, 4, 5, 9, 10, 15].map((level) => library.wwnmSafe(level))).toEqual([0, 0, 500, 500, 16000, 16000]);
    expect(library.wwnmMoney({ userlanguage: "de_DE" }, 1000000)).toBe("1.000.000 €");
    expect(library.wwnmMoney({ userlanguage: "en_US" }, 16000)).toBe("€16,000");
  });

  it("50:50 takes away two wrong answers and never the right one - once it was used, the joker is used", () => {
    for (let run = 0; run < 50; run++) {
      const vars: Vars = {};
      const { block, getBlock, hidden } = questionStub();
      library.wwnmFiftyFifty(vars, getBlock);
      expect(hidden.size).toBe(2);
      expect(hidden.has("o0")).toBe(false);
      expect(block.visibleOptions.length).toBe(2);
      expect(vars.joker5050).toBe(true);
    }
  });

  it("the audience votes add up to 100 and give nothing to an answer that is gone - and favour the right answer more on the early questions", () => {
    const share = (level: number, hide: boolean) => {
      let total = 0;
      for (let run = 0; run < 400; run++) {
        const vars: Vars = { stufe: String(level - 1), userlanguage: "de_DE" };
        const { block, getBlock } = questionStub();
        if (hide) block.hideOptions([block.options[2], block.options[3]]);
        library.wwnmAudience(vars, getBlock);
        const lines = ["zeile2", "zeile3", "zeile4", "zeile5"].map((name) => String(vars[name]));
        const percent = lines.map((line) => (line === "" ? null : Number(/(\d+) %$/.exec(line)![1])));
        expect(percent.reduce((sum: number, value) => sum + (value ?? 0), 0)).toBe(100);
        if (hide) {
          expect(lines[2]).toBe("");
          expect(lines[3]).toBe("");
        }
        expect(vars.jokerPublikum).toBe(true);
        total += percent[0] ?? 0;
      }
      return total / 400;
    };
    expect(share(1, false)).toBeGreaterThan(80);
    expect(share(15, false)).toBeLessThan(55);
    expect(share(1, false)).toBeGreaterThan(share(15, false) + 25);
    // With two answers left the right one has more.
    expect(share(8, true)).toBeGreaterThan(share(8, false));
  });

  it("the audience speaks the language of the player", () => {
    const say = (userlanguage: string) => {
      const vars: Vars = { stufe: "0", userlanguage };
      library.wwnmAudience(vars, questionStub().getBlock);
      return vars.zeile1;
    };
    expect(say("de_DE")).toBe("Das Publikum stimmt ab:");
    expect(say("en_US")).toBe("The audience votes:");
  });

  it("the friend on the phone is sure and right on the early questions, rarely on the late ones, and never names an answer that is gone", () => {
    const tally = (level: number) => {
      const counts = { right: 0, clueless: 0, other: 0 };
      for (let run = 0; run < 600; run++) {
        const vars: Vars = { stufe: String(level - 1), userlanguage: "de_DE" };
        const { block, getBlock } = questionStub();
        block.hideOptions([block.options[1], block.options[2]]);
        library.wwnmPhone(vars, getBlock);
        const text = String(vars.zeile2);
        expect(vars.jokerTelefon).toBe(true);
        expect(vars.zeile3).toBe("");
        const named = /\b([A-D]) \(/.exec(text)?.[1];
        if (named !== undefined) expect(["A", "D"]).toContain(named);
        if (/weiß ich wirklich nicht/.test(text)) counts.clueless++;
        else if (/Ich bin mir sicher: A /.test(text)) counts.right++;
        else counts.other++;
      }
      return counts;
    };
    const early = tally(1);
    const late = tally(15);
    expect(early.right).toBeGreaterThan(450);
    expect(late.right).toBeLessThan(early.right / 2);
    expect(late.clueless).toBeGreaterThan(early.clueless + 100);
  });

  it("the friend answers in English when the player is", () => {
    const vars: Vars = { stufe: "0", userlanguage: "en_US" };
    library.wwnmPhone(vars, questionStub().getBlock);
    expect(vars.zeile1).toBe("Your friend on the phone:");
    expect(String(vars.zeile2)).toMatch(/I'm sure|I'm not sure|Sorry/);
  });

  it("does nothing, and says nothing, where the slide has no such question", () => {
    const vars: Vars = {};
    library.wwnmFiftyFifty(vars, () => null);
    library.wwnmAudience(vars, () => null);
    library.wwnmPhone(vars, () => null);
    expect(vars).toEqual({});
  });

  it("goes on after a right answer and ends the game after a wrong one, at the ending slide", () => {
    const jumps: unknown[][] = [];
    const jump = (...args: unknown[]) => void jumps.push(args);
    library.wwnmAnswered({ richtig: true }, jump);
    expect(jumps).toEqual([]);
    const vars: Vars = { richtig: false };
    library.wwnmAnswered(vars, jump);
    expect(jumps).toEqual([["17", "fade"]]);
    expect(vars.ausgang).toBe("falsch");
    // (The ending is the last slide.)
    expect(String(pages.length)).toBe("17");
  });

  it("tells what is kept at the end: nothing, the safe level, what one had when walking away, the million", () => {
    const end = (vars: Vars) => {
      const result: Vars = { userlanguage: "de_DE", ...vars };
      library.wwnmEnd(result);
      return [result.endtitel, result.endtext];
    };
    expect(end({ ausgang: "falsch", stufe: "3" })).toEqual(["Leider falsch", "Du gehst leider ohne Gewinn nach Hause."]);
    expect(end({ ausgang: "falsch", stufe: "7" })[1]).toBe("Du fällst auf die Sicherheitsstufe zurück und gehst mit 500 € nach Hause.");
    expect(end({ ausgang: "falsch", stufe: "12" })[1]).toContain("16.000 €");
    expect(end({ ausgang: "aussteigen", stufe: "7" })).toEqual(["Gut gespielt!", "Du steigst aus und nimmst 2.000 € mit."]);
    expect(end({ ausgang: "aussteigen", stufe: "0" })[1]).toBe("Du steigst aus, bevor du etwas gewonnen hast.");
    expect(end({ ausgang: "gewonnen", stufe: "15" })).toEqual(["Du hast die Million!", "Alle 15 Fragen richtig - herzlichen Glückwunsch zu 1.000.000 €!"]);
    const english: Vars = { userlanguage: "en_US", ausgang: "aussteigen", stufe: "10" };
    library.wwnmEnd(english);
    expect(english.endtext).toBe("You walk away with €16,000.");
  });

  it("walking away ends the game at the ending slide", () => {
    const jumps: unknown[][] = [];
    const vars: Vars = {};
    library.wwnmQuit(vars, (...args: unknown[]) => void jumps.push(args));
    expect(vars.ausgang).toBe("aussteigen");
    expect(jumps).toEqual([["17", "fade"]]);
  });
});
