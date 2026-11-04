"""The words of the app's own interface in all eight languages (what the tutorial quotes: buttons, menus, settings) - read from src/core/i18n, so that
the tutorial says exactly what the app says. `python3 -I ui.py` prints them; `word(key, lang)` gives one."""
import pathlib
import re

I18N = pathlib.Path(__file__).resolve().parents[2] / "src" / "core" / "i18n"
LANGS = ["de", "en", "es", "fr", "pt", "it", "tr", "pl"]


def _entries(text):
    return {m.group(1): bytes(m.group(2), "utf-8").decode("unicode_escape").encode("latin-1", "ignore").decode("utf-8", "ignore") if False else m.group(2).replace('\\"', '"').replace("\\n", "\n") for m in re.finditer(r'^\s*"([A-Za-z0-9_.]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$', text, re.M)}


def _load():
    ui = (I18N / "uiStrings.ts").read_text()
    tr = (I18N / "translations.ts").read_text()
    # the English block comes first, the German one after it (each file holds both, in this order)
    parts = {}
    for name, text in (("ui", ui), ("tr", tr)):
        keys = {}
        seen = {}
        for m in re.finditer(r'^\s*"([A-Za-z0-9_.]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$', text, re.M):
            k, v = m.group(1), m.group(2).replace('\\"', '"').replace("\\n", "\n")
            n = seen.get(k, 0)
            seen[k] = n + 1
            keys.setdefault(k, {})["en" if n == 0 else "de"] = v
        parts.update(keys)
    for lang in LANGS[2:]:
        text = (I18N / "locales" / f"{lang}.ts").read_text()
        for m in re.finditer(r'^\s*"([A-Za-z0-9_.]+)":\s*"((?:[^"\\]|\\.)*)",?\s*$', text, re.M):
            parts.setdefault(m.group(1), {})[lang] = m.group(2).replace('\\"', '"').replace("\\n", "\n")
    return parts


STRINGS = _load()


def word(key, lang):
    return STRINGS[key][lang]


KEYS = [
    "ui.file", "ui.settings", "ui.open", "ui.save", "ui.join_invitation", "ui.settings_card_collaboration", "ui.work_on_the_file_together", "ui.copy_link",
    "ui.invitation_link", "ui.join", "settings.network.legend", "settings.network.turnUrl", "settings.network.turnUser", "settings.network.turnPassword",
    "ui.folder_sync", "ui.choose_folder_and_sync", "ui.merge_with_file", "ui.export", "ui.live_collaboration", "ui.folder_module_title",
]

if __name__ == "__main__":
    for k in KEYS:
        print(k)
        for lang in LANGS:
            print(f"   {lang}: {STRINGS.get(k, {}).get(lang, '??')}")
