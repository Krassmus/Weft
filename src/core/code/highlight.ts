import hljs from "highlight.js/lib/common";

/** Languages offered in the sidebar - all of them part of highlight.js's "common" bundle. */
export const CODE_LANGUAGES: { id: string; label: string }[] = [
  { id: "javascript", label: "JavaScript" },
  { id: "typescript", label: "TypeScript" },
  { id: "python", label: "Python" },
  { id: "java", label: "Java" },
  { id: "kotlin", label: "Kotlin" },
  { id: "swift", label: "Swift" },
  { id: "csharp", label: "C#" },
  { id: "cpp", label: "C++" },
  { id: "c", label: "C" },
  { id: "go", label: "Go" },
  { id: "rust", label: "Rust" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "sql", label: "SQL" },
  { id: "xml", label: "HTML / XML" },
  { id: "css", label: "CSS" },
  { id: "scss", label: "SCSS" },
  { id: "json", label: "JSON" },
  { id: "yaml", label: "YAML" },
  { id: "bash", label: "Bash" },
  { id: "markdown", label: "Markdown" },
  { id: "diff", label: "Diff" },
  { id: "plaintext", label: "Kein Highlighting" },
];

export const AUTO_LANGUAGE = "auto";

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * `code` as highlighted HTML (spans with hljs-* classes; everything else escaped) - safe to put
 * into innerHTML. An unknown language falls back to a guess, and anything the highlighter chokes
 * on falls back to plain escaped text rather than throwing. Shared by the editor and by
 * buildRuntimeHtml.ts, which pre-renders it into the exported player (so that needs no
 * highlighter of its own).
 */
export function highlightCodeToHtml(code: string, language: string): string {
  try {
    if (language !== AUTO_LANGUAGE && hljs.getLanguage(language)) {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value;
    }
    return hljs.highlightAuto(code, CODE_LANGUAGES.map((l) => l.id).filter((id) => id !== "plaintext")).value;
  } catch {
    return escapeHtml(code);
  }
}
