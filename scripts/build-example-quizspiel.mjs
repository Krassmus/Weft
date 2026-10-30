#!/usr/bin/env node
// Baut das Beispiel "Wer wird nicht Millionär?" (src/start-content/examples/quizspiel.weft) mit der Kommandozeile `weft`.
//
//   npm run build:cli && node scripts/build-example-quizspiel.mjs [ausgabe.weft]
//
// Die Fragen, ihre Erklärungen und alle Texte stehen hier in beiden Sprachen (de_DE, en_US). Die Joker (50:50, Publikum, Telefon), die
// Gewinnstufen und das Ende stehen in einer Skript-Bibliothek des Moduls (WWNM_LIBRARY); die Logikblöcke auf den Folien rufen sie nur auf.
// Das Skript baut das Modul auf Deutsch und übersetzt es danach mit `weft text export` / `import` aus den hier gesammelten Paaren.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const weftCli = join(root, "cli/dist/weft.mjs");
const target = resolve(process.argv[2] ?? join(root, "src/start-content/examples/quizspiel.weft"));
const work = mkdtempSync(join(tmpdir(), "weft-quizspiel-"));
const weft = (...args) => execFileSync("node", [weftCli, ...args], { encoding: "utf8", cwd: work, stdio: ["ignore", "pipe", "pipe"] });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Texte: jedes Paar (deutsch, englisch) wird hier gesammelt und später in den englischen Texten des Moduls eingesetzt.
// ---------------------------------------------------------------------------------------------------------------------------------------------
const translations = new Map();
const T = (de, en) => {
  if (translations.has(de) && translations.get(de) !== en) throw new Error(`Zwei Übersetzungen für denselben Text: ${de}`);
  translations.set(de, en);
  return de;
};

const PRIZES = [0, 50, 100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 500000, 1000000];
const SAFE_LEVELS = [5, 10];
const group = (n, separator) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
const money = (n, lang) => (lang === "de" ? `${group(n, ".")} €` : `€${group(n, ",")}`);

// Die Fragen: je vier Antworten (A bis D) in beiden Sprachen, die Nummer der richtigen und eine Erklärung, die nach dem Abschicken steht.
// Nur Wissensfragen, die sich nicht auf Wörter einer Sprache stützen - sie gehen in beiden Sprachen.
const QUESTIONS = [
  { q: ["Wie viele Beine hat eine Spinne?", "How many legs does a spider have?"], a: [["6", "6"], ["8", "8"], ["10", "10"], ["12", "12"]], right: 1,
    why: ["Spinnen sind Achtbeiner - anders als Insekten, die sechs Beine haben.", "Spiders have eight legs - unlike insects, which have six."] },
  { q: ["Welche Farbe entsteht, wenn man gelbe und blaue Farbe mischt?", "Which colour do you get when you mix yellow and blue paint?"], a: [["Orange", "Orange"], ["Violett", "Purple"], ["Braun", "Brown"], ["Grün", "Green"]], right: 3,
    why: ["Gelb und Blau ergeben beim Mischen von Farben Grün.", "Mixing yellow and blue paint gives green."] },
  { q: ["Wie viele Spielerinnen und Spieler hat eine Fußballmannschaft auf dem Feld, die Torhüterin oder den Torhüter eingerechnet?", "How many players does a football team have on the pitch, the goalkeeper included?"], a: [["9", "9"], ["10", "10"], ["11", "11"], ["12", "12"]], right: 2,
    why: ["Jede Mannschaft spielt mit elf Personen auf dem Platz.", "Each team plays with eleven players on the pitch."] },
  { q: ["Welcher Planet ist der Sonne am nächsten?", "Which planet is closest to the Sun?"], a: [["Merkur", "Mercury"], ["Venus", "Venus"], ["Mars", "Mars"], ["Erde", "Earth"]], right: 0,
    why: ["Merkur umkreist die Sonne in nur 88 Tagen.", "Mercury orbits the Sun in just 88 days."] },
  { q: ["Aus welchem Land stammt die Pizza?", "Which country does pizza come from?"], a: [["Spanien", "Spain"], ["Griechenland", "Greece"], ["Frankreich", "France"], ["Italien", "Italy"]], right: 3,
    why: ["Die Pizza kommt aus Neapel in Italien.", "Pizza comes from Naples, in Italy."] },
  { q: ["Wer malte die Mona Lisa?", "Who painted the Mona Lisa?"], a: [["Michelangelo", "Michelangelo"], ["Raffael", "Raphael"], ["Leonardo da Vinci", "Leonardo da Vinci"], ["Botticelli", "Botticelli"]], right: 2,
    why: ["Leonardo da Vinci malte das Bild Anfang des 16. Jahrhunderts; es hängt im Louvre in Paris.", "Leonardo da Vinci painted it in the early 16th century; it hangs in the Louvre in Paris."] },
  { q: ["Welches chemische Zeichen hat Gold?", "What is the chemical symbol of gold?"], a: [["Au", "Au"], ["Ag", "Ag"], ["Go", "Go"], ["Gd", "Gd"]], right: 0,
    why: ["Au kommt vom lateinischen „aurum“. Ag ist das Zeichen für Silber (lateinisch „argentum“).", "Au comes from the Latin “aurum”. Ag is silver (Latin “argentum”)."] },
  { q: ["Welches ist das größte Säugetier der Erde?", "Which is the largest mammal on Earth?"], a: [["Elefant", "Elephant"], ["Giraffe", "Giraffe"], ["Nashorn", "Rhinoceros"], ["Blauwal", "Blue whale"]], right: 3,
    why: ["Ein Blauwal wird bis zu 30 Meter lang und ist das größte Tier, das man kennt.", "A blue whale grows up to 30 metres long and is the largest animal known."] },
  { q: ["In welchem Jahr fiel die Berliner Mauer?", "In which year did the Berlin Wall fall?"], a: [["1961", "1961"], ["1989", "1989"], ["1979", "1979"], ["1991", "1991"]], right: 1,
    why: ["Am 9. November 1989 öffnete sich die Grenze. Gebaut wurde die Mauer 1961.", "The border opened on 9 November 1989. The wall had been built in 1961."] },
  { q: ["Wie heißt die Hauptstadt von Australien?", "What is the capital of Australia?"], a: [["Canberra", "Canberra"], ["Sydney", "Sydney"], ["Melbourne", "Melbourne"], ["Perth", "Perth"]], right: 0,
    why: ["Canberra wurde als Hauptstadt eigens geplant, weil sich Sydney und Melbourne nicht einigen konnten.", "Canberra was planned as the capital because Sydney and Melbourne could not agree."] },
  { q: ["Welches chemische Element hat die Ordnungszahl 26?", "Which chemical element has the atomic number 26?"], a: [["Kupfer", "Copper"], ["Nickel", "Nickel"], ["Eisen", "Iron"], ["Zink", "Zinc"]], right: 2,
    why: ["Eisen (Fe) hat 26 Protonen im Atomkern.", "Iron (Fe) has 26 protons in its nucleus."] },
  { q: ["Wie heißt der höchste Berg Afrikas?", "What is the highest mountain in Africa?"], a: [["Mount Kenya", "Mount Kenya"], ["Toubkal", "Toubkal"], ["Kilimandscharo", "Kilimanjaro"], ["Ruwenzori", "Rwenzori"]], right: 2,
    why: ["Der Kilimandscharo in Tansania ist mit 5895 Metern der höchste Berg Afrikas.", "Kilimanjaro in Tanzania is Africa's highest mountain, at 5,895 metres."] },
  { q: ["Wer flog als erster Mensch ins Weltall?", "Who was the first human in space?"], a: [["Alan Shepard", "Alan Shepard"], ["Juri Gagarin", "Yuri Gagarin"], ["Neil Armstrong", "Neil Armstrong"], ["German Titow", "Gherman Titov"]], right: 1,
    why: ["Juri Gagarin umrundete die Erde am 12. April 1961 in der Raumkapsel Wostok 1.", "Yuri Gagarin orbited the Earth on 12 April 1961 in the Vostok 1 spacecraft."] },
  { q: ["Welche ist die kleinste Primzahl, die größer als 50 ist?", "What is the smallest prime number greater than 50?"], a: [["51", "51"], ["57", "57"], ["59", "59"], ["53", "53"]], right: 3,
    why: ["51 = 3 · 17 und 57 = 3 · 19 sind durch 3 teilbar. 53 ist die erste Primzahl hinter der 50.", "51 = 3 · 17 and 57 = 3 · 19 are divisible by 3. 53 is the first prime after 50."] },
  { q: ["Wie heißt der größte Mond des Saturn?", "What is the name of Saturn's largest moon?"], a: [["Europa", "Europa"], ["Titan", "Titan"], ["Ganymed", "Ganymede"], ["Enceladus", "Enceladus"]], right: 1,
    why: ["Titan ist größer als der Planet Merkur und hat als einziger Mond eine dichte Atmosphäre.", "Titan is larger than the planet Mercury and the only moon with a dense atmosphere."] },
];

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Die Bibliothek des Moduls: Gewinnstufen, die drei Joker, das Aussteigen, die falsche Antwort und das Ende. Läuft einmal beim Start; die Logikblöcke
// auf den Folien rufen die Funktionen mit `vars`, `getBlock` und `jump` auf (die gibt es in einer Bibliothek selbst nicht).
// Der Zustand steckt in Variablen (nur Texte und Ja/Nein: eine Zahlen-Variable würde die Tabelle am Ende des Moduls anzeigen):
//   stufe        "0" bis "15": die letzte richtig beantwortete Frage        ausgang   "falsch", "aussteigen" oder "gewonnen"
//   richtig      Ja/Nein: die letzte Antwort war richtig (setzt das Quiz)
//   joker...     Ja/Nein: der Joker ist benutzt                              zeile1-5  die Anzeige der Joker (Publikum, Telefon)
//   endtitel, endtext   was die Schlussfolie sagt
// ---------------------------------------------------------------------------------------------------------------------------------------------
const WWNM_LIBRARY = `
var WWNM_PRIZES = ${JSON.stringify(PRIZES)};

function wwnmGerman(vars) {
  return String(vars.userlanguage || "de").indexOf("de") === 0;
}

function wwnmMoney(vars, amount) {
  var digits = String(amount);
  if (wwnmGerman(vars)) return digits.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".") + "\\u00a0\\u20ac";
  return "\\u20ac" + digits.replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",");
}

// Sicher sind 500 ab Frage 5 und 16000 ab Frage 10.
function wwnmSafe(level) {
  return level >= 10 ? WWNM_PRIZES[10] : level >= 5 ? WWNM_PRIZES[5] : 0;
}

function wwnmShuffle(list) {
  var copy = list.slice();
  for (var i = copy.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var swap = copy[i];
    copy[i] = copy[j];
    copy[j] = swap;
  }
  return copy;
}

function wwnmLetter(option) {
  return "ABCD".charAt(option.index);
}

// Die Frage, an der man steht: die nach der letzten richtigen (1 bis 15). Je höher, desto schwerer.
function wwnmLevel(vars) {
  return (Number(vars.stufe) || 0) + 1;
}

function wwnmUsed(vars, name) {
  vars[name] = true;
}

// 50:50: zwei falsche Antworten verschwinden.
function wwnmFiftyFifty(vars, getBlock) {
  var question = getBlock("Frage");
  if (!question) return;
  var wrong = wwnmShuffle(question.wrongOptions.filter(function (option) { return !option.hidden; }));
  question.hideOptions(wrong.slice(0, 2));
  wwnmUsed(vars, "joker5050");
}

// Publikum: Wie viele Prozent die richtige Antwort bekommt, hängt von der Frage ab (95 % bei der ersten, etwa 40 % bei der letzten) und wird jedes Mal
// neu ausgewürfelt. Ausgeblendete Antworten bekommen nichts.
function wwnmAudience(vars, getBlock) {
  var question = getBlock("Frage");
  if (!question) return;
  var level = wwnmLevel(vars);
  var visible = question.visibleOptions;
  var chance = 0.95 - (level - 1) * (0.55 / 14);
  var weights = visible.map(function (option) {
    return option.correct ? chance * (0.85 + 0.3 * Math.random()) : ((1 - chance) / 3) * (0.3 + 1.4 * Math.random());
  });
  var total = weights.reduce(function (sum, weight) { return sum + weight; }, 0);
  var raw = weights.map(function (weight) { return (weight / total) * 100; });
  var percent = raw.map(Math.floor);
  var missing = 100 - percent.reduce(function (sum, value) { return sum + value; }, 0);
  raw
    .map(function (value, index) { return { index: index, rest: value - Math.floor(value) }; })
    .sort(function (a, b) { return b.rest - a.rest; })
    .slice(0, missing)
    .forEach(function (entry) { percent[entry.index]++; });
  var german = wwnmGerman(vars);
  vars.zeile1 = german ? "Das Publikum stimmt ab:" : "The audience votes:";
  question.options.forEach(function (option, index) {
    var place = visible.indexOf(option);
    var value = place < 0 ? null : percent[place];
    var bar = value === null ? "" : new Array(Math.max(1, Math.round(value / 5)) + 1).join("\\u2588");
    vars["zeile" + (index + 2)] = value === null ? "" : wwnmLetter(option) + "  " + bar + " " + value + " %";
  });
  wwnmUsed(vars, "jokerPublikum");
}

// Telefon: Die Freundin oder der Freund weiß es sicher und richtig - oder sicher und falsch, oder rät, oder hat keine Ahnung. Je höher die Frage,
// desto seltener das Erste. Die Antwort kommt nie von einer ausgeblendeten Antwort.
function wwnmPhone(vars, getBlock) {
  var question = getBlock("Frage");
  if (!question) return;
  var german = wwnmGerman(vars);
  var t = (wwnmLevel(vars) - 1) / 14;
  var clueless = 0.05 + 0.4 * t;
  var sureRight = (1 - clueless) * (0.9 - 0.7 * t);
  var sureWrong = (1 - clueless) * (0.03 + 0.12 * t);
  var visible = question.visibleOptions;
  var roll = Math.random();
  var right = visible.filter(function (option) { return option.correct; })[0] || visible[0];
  var wrong = visible.filter(function (option) { return !option.correct; });
  var text;
  var say = function (option) { return wwnmLetter(option) + " (" + option.text.replace(/^[A-D]:\\s*/, "") + ")"; };
  if (roll < clueless) {
    text = german ? "Tut mir leid, das weiß ich wirklich nicht." : "Sorry, I really don't know.";
  } else if (roll < clueless + sureRight) {
    text = (german ? "Ich bin mir sicher: " : "I'm sure: ") + say(right) + ".";
  } else if (roll < clueless + sureRight + sureWrong && wrong.length > 0) {
    text = (german ? "Ich bin mir sicher: " : "I'm sure: ") + say(wwnmShuffle(wrong)[0]) + ".";
  } else {
    var guess = wwnmShuffle(visible)[0];
    text = (german ? "Sicher bin ich nicht, aber ich würde auf " : "I'm not sure, but I'd go for ") + say(guess) + (german ? " tippen." : ".");
  }
  vars.zeile1 = german ? "Deine Freundin am Telefon:" : "Your friend on the phone:";
  vars.zeile2 = text;
  vars.zeile3 = "";
  vars.zeile4 = "";
  vars.zeile5 = "";
  wwnmUsed(vars, "jokerTelefon");
}

function wwnmQuit(vars, jump) {
  vars.ausgang = "aussteigen";
  jump("17", "fade");
}

// Nach dem Abschicken (die Rückmeldung des Quiz war einen Moment zu sehen): Eine falsche Antwort beendet das Spiel. Bei einer richtigen läuft das Skript einfach
// aus, und sein Auslöser zu "Nächste Folie" geht weiter zur nächsten Frage (ein jump lässt ihn nicht mehr auslösen).
function wwnmAnswered(vars, jump) {
  if (vars.richtig) return;
  vars.ausgang = "falsch";
  jump("17", "fade");
}

// Die Schlussfolie: wie das Spiel ausging und was man mitnimmt.
function wwnmEnd(vars) {
  var german = wwnmGerman(vars);
  var level = Number(vars.stufe) || 0;
  if (vars.ausgang === "gewonnen") {
    vars.endtitel = german ? "Du hast die Million!" : "You won the million!";
    vars.endtext = german ? "Alle 15 Fragen richtig - herzlichen Glückwunsch zu " + wwnmMoney(vars, WWNM_PRIZES[15]) + "!" : "All 15 questions right - congratulations on " + wwnmMoney(vars, WWNM_PRIZES[15]) + "!";
  } else if (vars.ausgang === "aussteigen") {
    var kept = WWNM_PRIZES[level];
    vars.endtitel = german ? "Gut gespielt!" : "Well played!";
    vars.endtext = kept > 0 ? (german ? "Du steigst aus und nimmst " + wwnmMoney(vars, kept) + " mit." : "You walk away with " + wwnmMoney(vars, kept) + ".") : (german ? "Du steigst aus, bevor du etwas gewonnen hast." : "You walk away before winning anything.");
  } else {
    var safe = wwnmSafe(level);
    vars.endtitel = german ? "Leider falsch" : "Sorry, that was wrong";
    vars.endtext = safe > 0 ? (german ? "Du fällst auf die Sicherheitsstufe zurück und gehst mit " + wwnmMoney(vars, safe) + " nach Hause." : "You fall back to the safe level and go home with " + wwnmMoney(vars, safe) + ".") : (german ? "Du gehst leider ohne Gewinn nach Hause." : "You go home without any winnings.");
  }
}
`;

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Aussehen
// ---------------------------------------------------------------------------------------------------------------------------------------------
const GOLD = "#fbbf24";
const MUTED = "#8ea3d6";
const WHITE = "#f8fafc";
const nbsp = " ";

const paragraph = (inner, { size = 2, align, gap = 0, line = 1.3 } = {}) =>
  `<p style="margin:0 0 ${gap}cqw 0;line-height:${line};${align ? `text-align:${align};` : ""}font-size:${size}cqw">${inner}</p>`;
const colored = (color, inner) => `<font color="${color}">${inner}</font>`;

const ladderHtml = (lang, level) => {
  const lines = [];
  for (let n = 15; n >= 1; n--) {
    const here = n === level;
    const safe = SAFE_LEVELS.includes(n);
    const marker = here ? "▶" : safe ? "◆" : nbsp;
    const text = `${marker}${nbsp}${String(n).padStart(2, nbsp)}${nbsp}${nbsp}${money(PRIZES[n], lang)}`;
    lines.push(paragraph(colored(here ? GOLD : safe ? WHITE : MUTED, here ? `<b>${text}</b>` : text), { size: 1.9 }));
  }
  return lines.join("");
};

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Die Operationen
// ---------------------------------------------------------------------------------------------------------------------------------------------
const HTML = (deHtml, enHtml) => T(deHtml, enHtml);
// Ein Text mit seinem HTML in beiden Sprachen: `build(lang)` baut es für "de" oder "en".
const bi = (build) => T(build("de"), build("en"));
const pick = (lang, de, en) => (lang === "de" ? de : en);

const ops = [];
const add = (op) => ops.push(op);
const clearEnd = (page) => {
  for (let i = 0; i < 8; i++) add({ op: "set_trigger", page, to: "end", from: null });
};

add({ op: "set_title", title: "Wer wird nicht Millionär?" });
add({ op: "set_languages", languages: ["de_DE", "en_US"] });
add({ op: "set_keyboard_navigation", enabled: false });
add({ op: "set_look", brightness: "dark", accentColor: GOLD, interactiveStyle: "round" });
add({ op: "set_palette", colors: [GOLD, WHITE, MUTED, "#38bdf8", "#34d399", "#f87171"] });

const variables = [
  ["joker5050", "boolean", false],
  ["jokerPublikum", "boolean", false],
  ["jokerTelefon", "boolean", false],
  ["richtig", "boolean", false],
  ["stufe", "string", "0"],
  ["ausgang", "string", ""],
  ["zeile1", "string", ""],
  ["zeile2", "string", ""],
  ["zeile3", "string", ""],
  ["zeile4", "string", ""],
  ["zeile5", "string", ""],
  ["endtitel", "string", ""],
  ["endtext", "string", ""],
];
for (const [name, type, initialValue] of variables) add({ op: "add_variable", name, type, initialValue });
const reset = variables.map(([name, , initialValue]) => ({ variableId: name, op: "set", value: initialValue }));

add({ op: "add_script_library", name: "wwnm", code: WWNM_LIBRARY });

// Das Layout: ein dunkler Verlauf und der Sprachumschalter oben rechts.
add({ op: "add_layout", name: "Spiel", as: "layout" });
add({ op: "add_shape", layout: "$layout", shape: "rectangle", x: 0, y: 0, width: 100, height: 100, gradient: { kind: "linear", angle: 135, stops: [["#0b1124", 0], ["#1c1a4d", 100]] }, name: "Hintergrund" });
add({ op: "add_block", layout: "$layout", kind: "language", set: { position: { x: 75, y: 3, width: 22, height: 6 } } });

// Folie 1: der Anfang.
add({ op: "add_page", layout: "$layout", as: "start" });
add({
  op: "add_text", page: "$start", x: 8, y: 12, width: 84, height: 14, name: "Titel",
  html: bi((l) => paragraph(colored(GOLD, `<b>${pick(l, "Wer wird nicht Millionär?", "Who Won't Be a Millionaire?")}</b>`), { size: pick(l, 6, 5.2), align: "center" })),
});
add({
  op: "add_text", page: "$start", x: 12, y: 28, width: 76, height: 12.5, name: "Untertitel",
  html: bi((l) => paragraph(pick(l, "Beantworte 15 Fragen und gewinne eine Million - oder steige rechtzeitig aus.", "Answer 15 questions and win a million - or walk away in time."), { size: 2.6, align: "center", line: 1.25 })),
});
const rules = [
  ["Bei jeder Frage ist genau eine Antwort richtig.", "Exactly one answer is right in every question."],
  ["Du hast drei Joker, jeden nur einmal: 50:50, Publikum und Telefon.", "You have three jokers, each only once: 50:50, audience and phone."],
  [`Sicher sind ${money(500, "de")} ab Frage 5 und ${money(16000, "de")} ab Frage 10. Eine falsche Antwort wirft dich auf die letzte Sicherheitsstufe zurück.`, `${money(500, "en")} is safe from question 5 and ${money(16000, "en")} from question 10. A wrong answer drops you back to the last safe level.`],
  ["Mit „Aussteigen“ nimmst du den Gewinn mit, den du gerade hast.", "With “Walk away” you keep the winnings you have right now."],
];
add({
  op: "add_text", page: "$start", x: 14, y: 42, width: 72, height: 36, name: "Regeln",
  html: bi((l) => rules.map(([de, en]) => paragraph(`${nbsp}${nbsp}${colored(GOLD, "◆")}${nbsp}${nbsp}${pick(l, de, en)}`, { size: 2.1, gap: 1.2, line: 1.3 })).join("")),
});
add({
  op: "add_text", page: "$start", x: 14, y: 92, width: 72, height: 5, name: "Hinweis",
  html: bi((l) => paragraph(colored(MUTED, pick(l, "Ein Beispiel für Weft - mit dem Fernsehspiel hat es nichts zu tun.", "An example for Weft - not affiliated with the TV show.")), { size: 1.6, align: "center" })),
});
add({ op: "add_block", page: "$start", kind: "button", as: "startButton", set: { name: "Spiel starten", text: T("Spiel starten", "Start the game"), action: "advance", onClick: reset, position: { x: 38, y: 79, width: 24, height: 9 } } });

// Folien 2 bis 16: die Fragen.
const END_PAGE = 17;
QUESTIONS.forEach((question, index) => {
  const level = index + 1;
  const n = `_${level}`;
  const page = `$page${n}`;
  add({ op: "add_page", layout: "$layout", as: `page${n}` });

  const letters = "ABCD";
  const options = question.a.map(([de, en], i) => ({ id: `o${i}`, html: HTML(`<p>${letters[i]}: ${de}</p>`, `<p>${letters[i]}: ${en}</p>`) }));
  const last = level === 15;
  add({
    op: "add_block", page, kind: "quiz", as: `quiz${n}`,
    set: {
      name: "Frage", single: true, required: true,
      questionHtml: HTML(`<p>${question.q[0]}</p>`, `<p>${question.q[1]}</p>`),
      options, correctOptionIds: [`o${question.right}`],
      explanation: T(question.why[0], question.why[1]),
      onIncorrect: [{ variableId: "richtig", op: "set", value: false }],
      onCorrect: [{ variableId: "stufe", op: "set", value: String(level) }, { variableId: "richtig", op: "set", value: true }, ...(last ? [{ variableId: "ausgang", op: "set", value: "gewonnen" }] : []), ...["zeile1", "zeile2", "zeile3", "zeile4", "zeile5"].map((variableId) => ({ variableId, op: "set", value: "" }))],
      position: { x: 4, y: 18.5, width: 64, height: 58 },
    },
  });

  add({
    op: "add_text", page, x: 4, y: 4, width: 64, height: 7, name: "Frage",
    html: bi((l) => paragraph(`${colored(GOLD, `<b>${pick(l, `Frage ${level} von 15`, `Question ${level} of 15`)}</b>`)}${nbsp}${nbsp}·${nbsp}${nbsp}${money(PRIZES[level], l)}`, { size: 2.8, line: 1.2 })),
  });
  add({ op: "add_text", page, x: 72, y: 11, width: 24, height: 72, name: "Gewinnleiter", box: { fillOpacity: 0.12, radius: 1.5, padding: 1.4 }, html: bi((l) => ladderHtml(l, level)) });
  add({
    op: "add_text", page, x: 4, y: 77, width: 64, height: 21.5, name: "Joker-Anzeige",
    html: bi(() => ["zeile1", "zeile2", "zeile3", "zeile4", "zeile5"].map((name, i) => paragraph(colored(i === 0 ? GOLD : "#7dd3fc", `{{${name}}}`), { size: 1.8, line: 1.3 })).join("")),
  });

  // Die Joker und das Aussteigen: je ein Button, der sein Skript auslöst; ein benutzter Joker verschwindet (auch auf den späteren Folien).
  const hidden = { type: "none", durationMs: 0 };
  const jokers = [
    ["50:50", "50:50", "fifty", "wwnmFiftyFifty(vars, getBlock);", "joker5050", 4],
    ["Publikum", "Audience", "audience", "wwnmAudience(vars, getBlock);", "jokerPublikum", 20],
    ["Telefon", "Phone", "phone", "wwnmPhone(vars, getBlock);", "jokerTelefon", 36],
  ];
  for (const [de, en, key, code, used, x] of jokers) {
    add({ op: "add_block", page, kind: "button", as: `${key}${n}`, set: { name: `Joker ${de}`, text: T(de, en), action: "event", exitEffect: hidden, position: { x, y: 11.5, width: 14.5, height: 6 } } });
    add({ op: "add_block", page, kind: "script", as: `${key}Script${n}`, set: { name: `Joker ${de}`, code } });
    add({ op: "set_trigger", page, to: `script-run:$${key}Script${n}`, from: `click:$${key}${n}` });
    add({ op: "set_trigger", page, to: `exit:$${key}${n}`, condition: used });
  }
  add({ op: "add_block", page, kind: "button", as: `quit${n}`, set: { name: "Aussteigen", text: T("Aussteigen", "Walk away"), action: "event", position: { x: 54, y: 11.5, width: 14, height: 6 } } });
  add({ op: "add_block", page, kind: "script", as: `quitScript${n}`, set: { name: "Aussteigen", code: "wwnmQuit(vars, jump);" } });
  add({ op: "set_trigger", page, to: `script-run:$quitScript${n}`, from: `click:$quit${n}` });
  // Nach dem Abschicken, wenn die Rückmeldung des Quiz einen Moment zu sehen war: das Skript sieht nach. Falsch: es springt zum Ende. Richtig: es läuft aus, und sein
  // Auslöser führt zu "Nächste Folie". Was sonst dorthin führte (die Weiter-Kette und jeder Button, der nur ein Ereignis auslöst), fällt weg: set_trigger nimmt bei
  // "from": null jeweils den ersten Auslöser weg.
  add({ op: "add_block", page, kind: "script", as: `answeredScript${n}`, set: { name: "Nach dem Abschicken", code: "wwnmAnswered(vars, jump);" } });
  add({ op: "set_trigger", page, to: `script-run:$answeredScript${n}`, from: `quiz-submit:$quiz${n}`, delayMs: 1800 });
  clearEnd(page);
  add({ op: "add_trigger", page, from: `script-run:$answeredScript${n}`, to: "end" });
});

// Folie 17: das Ende.
add({ op: "add_page", layout: "$layout", as: "ende" });
add({ op: "add_text", page: "$ende", x: 8, y: 22, width: 84, height: 14, name: "Ergebnis", html: bi(() => paragraph(colored(GOLD, "<b>{{endtitel}}</b>"), { size: 5.5, align: "center" })) });
add({ op: "add_text", page: "$ende", x: 14, y: 42, width: 72, height: 16, name: "Gewinn", html: bi(() => paragraph("{{endtext}}", { size: 2.8, align: "center", line: 1.35 })) });
add({ op: "add_block", page: "$ende", kind: "button", as: "again", set: { name: "Neues Spiel", text: T("Neues Spiel", "New game"), action: "goto", targetPageId: "1", position: { x: 38, y: 68, width: 24, height: 9 } } });
add({ op: "add_block", page: "$ende", kind: "script", as: "endScript", set: { name: "Ende", code: "wwnmEnd(vars);" } });
add({ op: "set_trigger", page: "$ende", to: "script-run:$endScript", from: "start" });

add({ op: "set_transition", page: "all", type: "fade", durationMs: 400 });
add({ op: "set_template", template: true });

// ---------------------------------------------------------------------------------------------------------------------------------------------
// Bauen, übersetzen, schreiben
// ---------------------------------------------------------------------------------------------------------------------------------------------
const file = join(work, "spiel.weft");
const built = join(work, "gebaut.weft");
weft("new", file, "--empty");
writeFileSync(join(work, "operationen.json"), JSON.stringify(ops, null, 1));
const answer = weft("edit", file, "operationen.json", "-o", built);
console.log(answer.split("\n").filter((line) => /Warnung|Fehler|Geschrieben/.test(line)).join("\n"));

weft("text", "export", built, "--from", "de_DE", "--to", "en_US", "-o", "texte.json");
const texts = JSON.parse(readFileSync(join(work, "texte.json"), "utf8"));
const missing = [];
for (const item of texts.items) {
  const en = translations.get(item.source);
  if (en === undefined) missing.push(`${item.context}: ${item.source}`);
  else item.translations.en_US = en;
}
if (missing.length > 0) throw new Error(`Ohne Übersetzung:\n${missing.join("\n")}`);
writeFileSync(join(work, "texte.json"), JSON.stringify(texts, null, 1));
weft("text", "import", built, "texte.json", "-o", target, "--force");
console.log(`Geschrieben: ${target}`);
console.log(weft("validate", target).trim());
