/**
 * The formula language behind "Berechnet" variables (and the built-in `success`'s optional formula),
 * e.g. `score > 10 && progress === 100`. It is JavaScript expression syntax - what you would write
 * in JavaScript works - with a few allowances, and it is never run as JavaScript: it is parsed here
 * and evaluated by the player's own small interpreter (see below), so a formula in a module can do
 * nothing but compute a value from the variables.
 *
 * What is understood: numbers (3, 0.5, 1e3), strings ("abc" or 'abc', with \n \t \\ \" \' escapes),
 * true/false, variable names - bare (score, progress), or in `backticks` when the name has spaces
 * or odd characters (`mein name`, which stands in for a JavaScript template literal, not supported)
 * - and these operators, tightest first: unary ! - + - ** - * / % - + - - < <= > >= - == != === !==
 * - && - || - the conditional `cond ? a : b`. Parentheses group. Functions (also written with a
 * `Math.` in front, as in JavaScript): min, max, round, floor, ceil, abs, and if(cond, then, else).
 *
 * Allowances beyond JavaScript: the words and/und for &&, or/oder for ||, not/nicht for ! (each is
 * exactly the symbol it names - so `not a == b` is `(!a) == b`, as in JavaScript: use parentheses),
 * wahr/falsch for true/false, and a single = for == . Not understood on purpose: assignments,
 * member access, anything that would call into the page.
 *
 * This file only PARSES (to a compact JSON syntax tree) and checks. Evaluating is the player's job
 * (player.runtime.js's evalExpression): buildRuntimeHtml.ts parses every formula once at export and
 * hands the player the trees, so the language itself exists in exactly one place.
 */

export type Expr =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "bool"; v: boolean }
  | { t: "var"; n: string }
  | { t: "not"; a: Expr }
  | { t: "neg"; a: Expr }
  | { t: "bin"; op: BinaryOp; a: Expr; b: Expr }
  | { t: "cond"; c: Expr; a: Expr; b: Expr }
  | { t: "call"; f: string; args: Expr[] };

export type BinaryOp =
  | "or"
  | "and"
  | "=="
  | "!="
  | "==="
  | "!=="
  | "<"
  | "<="
  | ">"
  | ">="
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "**";

/** Allowed argument counts per function: [min, max]. */
const FUNCTIONS: Record<string, [number, number]> = {
  if: [3, 3],
  min: [1, 8],
  max: [1, 8],
  round: [1, 1],
  floor: [1, 1],
  ceil: [1, 1],
  abs: [1, 1],
};

type Token = { kind: "num" | "str" | "name" | "quoted-name" | "op" | "end"; text: string; pos: number };

const WORD_OPERATORS: Record<string, string> = { and: "and", und: "and", or: "or", oder: "or", not: "not", nicht: "not" };
const WORD_LITERALS: Record<string, boolean> = { true: true, wahr: true, false: false, falsch: false };

class ExpressionError extends Error {}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "\\": "\\", '"': '"', "'": "'" };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(source[i + 1] ?? ""))) {
      const match = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(source.slice(i))!;
      tokens.push({ kind: "num", text: match[0], pos: i });
      i += match[0].length;
    } else if (ch === '"' || ch === "'") {
      let text = "";
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        if (source[j] === "\\" && j + 1 < source.length) {
          text += ESCAPES[source[j + 1]] ?? source[j + 1];
          j += 2;
        } else {
          text += source[j++];
        }
      }
      if (j >= source.length) throw new ExpressionError(`Der Text ab Position ${i + 1} ist nicht geschlossen (${ch} fehlt).`);
      tokens.push({ kind: "str", text, pos: i });
      i = j + 1;
    } else if (ch === "`") {
      const end = source.indexOf("`", i + 1);
      if (end === -1) throw new ExpressionError(`Der Variablenname ab Position ${i + 1} ist nicht geschlossen (\` fehlt).`);
      tokens.push({ kind: "quoted-name", text: source.slice(i + 1, end).trim(), pos: i });
      i = end + 1;
    } else if (/[\p{L}_$]/u.test(ch)) {
      const match = /^[\p{L}\p{N}_$]+/u.exec(source.slice(i))!;
      tokens.push({ kind: "name", text: match[0], pos: i });
      i += match[0].length;
    } else {
      const three = source.slice(i, i + 3);
      const two = source.slice(i, i + 2);
      if (three === "===" || three === "!==") {
        tokens.push({ kind: "op", text: three, pos: i });
        i += 3;
      } else if (["==", "!=", "<=", ">=", "&&", "||", "**"].includes(two)) {
        tokens.push({ kind: "op", text: two, pos: i });
        i += 2;
      } else if ("+-*/%()<>=!,?:.".includes(ch)) {
        tokens.push({ kind: "op", text: ch, pos: i });
        i++;
      } else {
        throw new ExpressionError(`Unerwartetes Zeichen „${ch}" an Position ${i + 1}.`);
      }
    }
  }
  tokens.push({ kind: "end", text: "", pos: source.length });
  return tokens;
}

class Parser {
  private index = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Expr {
    const expr = this.parseTernary();
    const next = this.peek();
    if (next.kind !== "end") throw new ExpressionError(`Unerwartet „${next.text}" an Position ${next.pos + 1}.`);
    return expr;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private take(): Token {
    return this.tokens[this.index++];
  }

  private isOp(text: string): boolean {
    const token = this.peek();
    return token.kind === "op" && token.text === text;
  }

  private isWord(canonical: string): boolean {
    const token = this.peek();
    return token.kind === "name" && WORD_OPERATORS[token.text.toLowerCase()] === canonical;
  }

  // Lowest precedence first, exactly JavaScript's order: ?: - || - && - equality - relational - + - -
  // * / % - ** - unary.
  private parseTernary(): Expr {
    const condition = this.parseOr();
    if (!this.isOp("?")) return condition;
    this.take();
    const then = this.parseTernary();
    if (!this.isOp(":")) throw new ExpressionError("Bei ? fehlt der Doppelpunkt (: für den Sonst-Fall).");
    this.take();
    return { t: "cond", c: condition, a: then, b: this.parseTernary() };
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isWord("or") || this.isOp("||")) {
      this.take();
      left = { t: "bin", op: "or", a: left, b: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseEquality();
    while (this.isWord("and") || this.isOp("&&")) {
      this.take();
      left = { t: "bin", op: "and", a: left, b: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): Expr {
    let left = this.parseRelational();
    while (this.isOp("==") || this.isOp("=") || this.isOp("!=") || this.isOp("===") || this.isOp("!==")) {
      const text = this.take().text;
      left = { t: "bin", op: (text === "=" ? "==" : text) as BinaryOp, a: left, b: this.parseRelational() };
    }
    return left;
  }

  private parseRelational(): Expr {
    let left = this.parseSum();
    while (this.isOp("<") || this.isOp("<=") || this.isOp(">") || this.isOp(">=")) {
      const op = this.take().text as BinaryOp;
      left = { t: "bin", op, a: left, b: this.parseSum() };
    }
    return left;
  }

  private parseSum(): Expr {
    let left = this.parseProduct();
    while (this.isOp("+") || this.isOp("-")) {
      const op = this.take().text as BinaryOp;
      left = { t: "bin", op, a: left, b: this.parseProduct() };
    }
    return left;
  }

  private parseProduct(): Expr {
    let left = this.parsePower();
    while (this.isOp("*") || this.isOp("/") || this.isOp("%")) {
      const op = this.take().text as BinaryOp;
      left = { t: "bin", op, a: left, b: this.parsePower() };
    }
    return left;
  }

  private parsePower(): Expr {
    const base = this.parseUnary();
    if (!this.isOp("**")) return base;
    this.take();
    return { t: "bin", op: "**", a: base, b: this.parsePower() }; // right-associative
  }

  // ! - + not nicht: all bind tighter than any binary operator, as in JavaScript.
  private parseUnary(): Expr {
    if (this.isWord("not") || this.isOp("!")) {
      this.take();
      return { t: "not", a: this.parseUnary() };
    }
    if (this.isOp("-")) {
      this.take();
      return { t: "neg", a: this.parseUnary() };
    }
    if (this.isOp("+")) {
      this.take();
      return this.parseUnary();
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.take();
    switch (token.kind) {
      case "num":
        return { t: "num", v: Number(token.text) };
      case "str":
        return { t: "str", v: token.text };
      case "quoted-name":
        if (!token.text) throw new ExpressionError(`Leerer Variablenname an Position ${token.pos + 1}.`);
        return { t: "var", n: token.text };
      case "name": {
        const lower = token.text.toLowerCase();
        if (lower in WORD_LITERALS) return { t: "bool", v: WORD_LITERALS[lower] };
        if (lower in WORD_OPERATORS) throw new ExpressionError(`„${token.text}" steht an Position ${token.pos + 1} an der falschen Stelle.`);
        // `Math.round(...)` is the same function as `round(...)`.
        if (token.text === "Math" && this.isOp(".")) {
          this.take();
          const member = this.take();
          if (member.kind !== "name" || !this.isOp("(")) {
            throw new ExpressionError(`Nach „Math." muss eine Funktion mit Klammern folgen (z. B. Math.round(x)).`);
          }
          return this.parseCall(member);
        }
        if (this.isOp("(")) return this.parseCall(token);
        return { t: "var", n: token.text };
      }
      case "op":
        if (token.text === "(") {
          const inner = this.parseTernary();
          if (!this.isOp(")")) throw new ExpressionError("Eine schließende Klammer fehlt.");
          this.take();
          return inner;
        }
        throw new ExpressionError(`Unerwartet „${token.text}" an Position ${token.pos + 1}.`);
      default:
        throw new ExpressionError("Der Ausdruck ist unvollständig.");
    }
  }

  private parseCall(nameToken: Token): Expr {
    const name = nameToken.text.toLowerCase();
    const arity = FUNCTIONS[name];
    if (!arity) throw new ExpressionError(`Die Funktion „${nameToken.text}" gibt es nicht (erlaubt: ${Object.keys(FUNCTIONS).join(", ")}).`);
    this.take(); // (
    const args: Expr[] = [];
    if (!this.isOp(")")) {
      args.push(this.parseTernary());
      while (this.isOp(",")) {
        this.take();
        args.push(this.parseTernary());
      }
    }
    if (!this.isOp(")")) throw new ExpressionError(`Bei ${nameToken.text}( fehlt die schließende Klammer.`);
    this.take();
    if (args.length < arity[0] || args.length > arity[1]) {
      const wanted = arity[0] === arity[1] ? `${arity[0]}` : `${arity[0]} bis ${arity[1]}`;
      throw new ExpressionError(`${nameToken.text}() braucht ${wanted} Angabe${wanted === "1" ? "" : "n"}, hier sind es ${args.length}.`);
    }
    return { t: "call", f: name, args };
  }
}

export type ParseResult = { ok: true; expr: Expr } | { ok: false; error: string };

/** Parses `source` - the syntax only; names aren't checked (see referencedNames). */
export function parseExpression(source: string): ParseResult {
  if (!source.trim()) return { ok: false, error: "Noch keine Berechnung eingegeben." };
  try {
    return { ok: true, expr: new Parser(tokenize(source)).parse() };
  } catch (error) {
    if (error instanceof ExpressionError) return { ok: false, error: error.message };
    throw error;
  }
}

/** Every variable name the expression reads. */
export function referencedNames(expr: Expr, into = new Set<string>()): Set<string> {
  switch (expr.t) {
    case "var":
      into.add(expr.n);
      break;
    case "not":
    case "neg":
      referencedNames(expr.a, into);
      break;
    case "bin":
      referencedNames(expr.a, into);
      referencedNames(expr.b, into);
      break;
    case "cond":
      referencedNames(expr.c, into);
      referencedNames(expr.a, into);
      referencedNames(expr.b, into);
      break;
    case "call":
      expr.args.forEach((arg) => referencedNames(arg, into));
      break;
  }
  return into;
}
