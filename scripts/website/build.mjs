// Makes the two pages of the website for the App Stores (privacy policy and support): website/privacy.html and website/support.html.
//   node scripts/website/build.mjs
// Every page is ONE file with all eight languages in it (texts.mjs); a script shows the one of the visitor's browser, and the language can be chosen on
// the page or in the address: privacy.html#fr (or ?lang=fr) - so the App Store can get an address for each language. (The sections have no
// id that equals such an address: the browser would scroll down to it and hide the bar with the languages.) Without the script the page is in
// English. The pages are self-contained: no cookies, nothing loaded from other sites, no analytics.
import { mkdirSync, writeFileSync } from "node:fs";
import { DISCORD, LANGS, NAMES, OWNER, T } from "./texts.mjs";

const OUT = new URL("../../website/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const CSS = `
    :root { color-scheme: light dark; --bg: #f9f9f9; --fg: #333; --head: #1a1a1a; --link: #0066cc; --line: #ddd; --note: #666; }
    @media (prefers-color-scheme: dark) { :root { --bg: #14161b; --fg: #d6d9df; --head: #f2f3f5; --link: #6ab0ff; --line: #333844; --note: #98a0ad; } }
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; line-height: 1.6; background-color: var(--bg); color: var(--fg); }
    h1, h2 { color: var(--head); line-height: 1.25; }
    h1 { font-size: 1.8rem; }
    h2 { font-size: 1.25rem; margin-top: 2rem; }
    a { color: var(--link); }
    .lang-toggle { text-align: right; margin-bottom: 2rem; line-height: 2; }
    .lang-toggle a { text-decoration: none; padding: 0 .25rem; }
    .lang-toggle a[aria-current="true"] { font-weight: 700; text-decoration: underline; }
    .lang-toggle .sep { color: var(--note); }
    .lang-section[hidden] { display: none; }
    address { font-style: normal; margin: 1rem 0; }
    .note { color: var(--note); font-size: .92rem; }
    footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line); font-size: .95rem; }
    footer .sep { color: var(--note); padding: 0 .4rem; }
`;

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mailLink = `<a href="mailto:${OWNER.mail}">${OWNER.mail}</a>`;
const discordLink = `<a href="${DISCORD}" target="_blank" rel="noopener">${DISCORD}</a>`;

function privacySection(lang) {
  const t = T[lang].privacy;
  const blocks = t.sections.map((s) => `        <h2>${s.h}</h2>\n${s.p.map((p) => `        <p>${p}</p>`).join("\n")}`).join("\n\n");
  return `        <h1>${esc(t.title)}</h1>

${blocks}

        <h2>${t.contactH}</h2>
        <p>${t.contactIntro}</p>
        <address>
            <strong>${OWNER.name}</strong><br>
            ${OWNER.street}<br>
            ${OWNER.town}, ${OWNER.country}<br>
            ${mailLink}
        </address>
        <p>${t.contactOutro}</p>
        <p class="note">${t.page}</p>`;
}

function supportSection(lang) {
  const t = T[lang].support;
  const fill = (s) => s.replace("{link}", discordLink).replace("{mail}", mailLink);
  return `        <h1>${esc(t.title)}</h1>
        <p>${t.intro}</p>

        <h2>${t.discordH}</h2>
        <p>${fill(t.discordText)}</p>
        <p class="note">${t.discordNote}</p>

        <h2>${t.emailH}</h2>
        <p>${fill(t.emailText)}</p>

        <h2>${t.bugsH}</h2>
        <p>${t.bugsText}</p>

        <h2>${t.startH}</h2>
        <p>${t.startText}</p>`;
}

function page(kind) {
  const titles = Object.fromEntries(LANGS.map((l) => [l, T[l][kind].title]));
  const sections = LANGS.map((l) => `    <!-- ${NAMES[l]} -->
    <div class="lang-section" data-section="${l}" lang="${l}"${l === "en" ? "" : " hidden"}>
${kind === "privacy" ? privacySection(l) : supportSection(l)}
    </div>`).join("\n\n");
  const toggle = LANGS.map((l) => `<a href="#${l}" data-lang="${l}"${l === "en" ? ' aria-current="true"' : ""}>${NAMES[l]}</a>`).join('<span class="sep"> | </span>\n        ');
  const other = kind === "privacy" ? "support" : "privacy";
  const footer = LANGS.map((l) => `<span data-lang-text="${l}"${l === "en" ? "" : " hidden"}><a href="${other}.html" data-other>${T[l].nav[other]}</a></span>`).join("\n        ");
  return `<!DOCTYPE html>
<html lang="en"><head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${esc(titles.en)}</title>
    <style>${CSS}    </style>
</head>
<body>

    <nav class="lang-toggle" aria-label="Language">
        ${toggle}
    </nav>

${sections}

    <footer>
        ${footer}
    </footer>

    <script>
        var LANGS = ${JSON.stringify(LANGS)};
        var TITLES = ${JSON.stringify(titles)};

        function chosen() {
            var wanted = [location.hash.slice(1), new URLSearchParams(location.search).get("lang")];
            for (var i = 0; i < wanted.length; i++) if (LANGS.indexOf(wanted[i]) >= 0) return wanted[i];
            var preferred = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || "en"];
            for (var j = 0; j < preferred.length; j++) {
                var code = String(preferred[j]).toLowerCase().split("-")[0];
                if (LANGS.indexOf(code) >= 0) return code;
            }
            return "en";
        }

        function setLanguage(lang) {
            document.querySelectorAll(".lang-section").forEach(function (section) { section.hidden = section.getAttribute("data-section") !== lang; });
            document.querySelectorAll("[data-lang-text]").forEach(function (item) { item.hidden = item.getAttribute("data-lang-text") !== lang; });
            document.querySelectorAll("[data-lang]").forEach(function (link) {
                if (link.getAttribute("data-lang") === lang) link.setAttribute("aria-current", "true"); else link.removeAttribute("aria-current");
            });
            document.querySelectorAll("[data-other]").forEach(function (link) { link.setAttribute("href", link.getAttribute("href").split("#")[0] + "#" + lang); });
            document.documentElement.lang = lang;
            document.title = TITLES[lang];
        }

        document.querySelectorAll(".lang-toggle a").forEach(function (link) {
            link.addEventListener("click", function (event) {
                event.preventDefault();
                var lang = link.getAttribute("data-lang");
                setLanguage(lang);
                history.replaceState(null, "", "#" + lang);
            });
        });
        window.addEventListener("hashchange", function () { setLanguage(chosen()); });
        setLanguage(chosen());
    </script>

</body></html>
`;
}

for (const kind of ["privacy", "support"]) {
  writeFileSync(`${OUT}${kind}.html`, page(kind));
  console.log(`website/${kind}.html`);
}
