/**
 * The catalog of languages a module can be offered in - a few hundred language/region pairs
 * ("locales" like en_US, de_DE, pt_BR), each with the flag of its region and a display name.
 *
 * Only the CODES are listed here. Names come from Intl.DisplayNames, in whatever language they are
 * asked for (the editor shows them in its own UI language, the player's language switcher shows
 * each one in ITS OWN language - "Français (France)", so a learner finds theirs), and the region a
 * bare language belongs to ("de" -> DE) from Intl.Locale's likely-subtags data. A module stores the
 * chosen locales in the "en_US" spelling (underscore) - the one the userlanguage variable has too.
 */

// ISO 639-1 languages (the two-letter codes) - each one's most likely region is looked up, not listed.
const LANGUAGE_CODES =
  "aa ab af ak am an ar as av ay az ba be bg bi bm bn bo br bs ca ce ch co cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl gn gu gv ha he hi hr ht hu hy ia id ig ii ik io is it iu ja jv ka kg ki kk kl km kn ko ks ku kw ky la lb lg li ln lo lt lu lv mg mh mi mk ml mn mr ms mt my nb nd ne nl nn no nr ny oc om or os pa pl ps pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta te tg th ti tk tl tn to tr ts tt ug uk ur uz ve vi vo wa wo xh yi yo za zh zu".split(
    " ",
  );

// Languages that only have a three-letter code (or are commonly listed apart from their macrolanguage).
const EXTRA_LANGUAGE_CODES =
  "ace ast ban bho bug ceb chr crh dsb dyu fil fon gsw haw hil hsb iba ilo jbo kab kmb kok lad lij lmo lua lun mad mag mai mak mni mos mwl nap nds nso pag pam pap sah sat scn sco sdh shn smn sms srn syr tet tig tpi tum tzm udm vai vec war wuu yue zap zza".split(
    " ",
  );

// Regional variants beyond a language's own most likely region.
const REGION_VARIANTS =
  "en_GB en_AU en_CA en_IN en_IE en_NZ en_ZA en_SG en_PH en_NG en_KE de_AT de_CH de_LU fr_CA fr_BE fr_CH fr_LU es_MX es_AR es_CO es_CL es_PE es_VE es_US es_419 pt_PT pt_AO pt_MZ nl_BE it_CH zh_TW zh_HK zh_SG ar_SA ar_AE ar_MA ar_DZ ar_TN ar_IQ ar_JO ar_LB sv_FI ru_UA ru_BY ro_MD sr_ME sr_BA hr_BA bs_BA ms_SG ms_BN ta_SG ta_LK bn_IN ur_IN pa_PK ko_KP fa_AF ps_PK sw_UG sw_CD so_DJ ca_AD de_LI nb_SJ uz_AF".split(
    " ",
  );

export interface LanguageEntry {
  /** "en_US" - the spelling stored in a module and used by the userlanguage variable. */
  locale: string;
  /** The flag emoji of the region ("🇺🇸"), a globe where the region has none. */
  flag: string;
  /** Display name in the language it was asked for, e.g. "Englisch (USA)". */
  name: string;
}

function toBcp47(locale: string): string {
  return locale.replace("_", "-");
}

/** A region code's flag as an emoji (two regional-indicator letters) - a globe for anything that
 * isn't a two-letter country code (the "world" and continent-sized regions like 419). */
export function flagForRegion(region: string | undefined): string {
  if (!region || !/^[A-Za-z]{2}$/.test(region)) return "🌐";
  return String.fromCodePoint(...[...region.toUpperCase()].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

function regionOf(locale: string): string | undefined {
  const parts = locale.split("_");
  if (parts[1]) return parts[1];
  try {
    return new Intl.Locale(parts[0]).maximize().region;
  } catch {
    return undefined;
  }
}

/** "de" -> "de_DE": a bare language code with the region it is most likely spoken in. */
function withLikelyRegion(language: string): string | null {
  const region = regionOf(language);
  return region ? `${language}_${region}` : null;
}

export function flagForLocale(locale: string): string {
  return flagForRegion(regionOf(locale));
}

/** The name of a locale ("Englisch (USA)") in `inLanguage` (a BCP 47 tag or a bare code). The first
 * letter is capitalised in that language, since names like "français" come out lowercase. */
export function languageName(locale: string, inLanguage: string): string {
  const [language, region] = locale.split("_");
  try {
    const languages = new Intl.DisplayNames([toBcp47(inLanguage)], { type: "language" });
    const name = languages.of(language);
    if (!name) return locale;
    const regionName = region ? new Intl.DisplayNames([toBcp47(inLanguage)], { type: "region" }).of(region) : undefined;
    const full = regionName && regionName !== region ? `${name} (${regionName})` : name;
    return full.charAt(0).toLocaleUpperCase(toBcp47(inLanguage)) + full.slice(1);
  } catch {
    return locale;
  }
}

let cachedLocales: string[] | null = null;

/** Every locale in the catalog (codes only, no particular order). Entries Intl can't name - an
 * engine without that language's data - are left out rather than shown as a bare code. */
function catalogLocales(): string[] {
  if (cachedLocales) return cachedLocales;
  const locales = new Set<string>();
  for (const code of [...LANGUAGE_CODES, ...EXTRA_LANGUAGE_CODES]) {
    const locale = withLikelyRegion(code);
    if (locale) locales.add(locale);
  }
  for (const variant of REGION_VARIANTS) locales.add(variant);
  cachedLocales = [...locales].filter((locale) => {
    try {
      const name = new Intl.DisplayNames(["en"], { type: "language" }).of(locale.split("_")[0]);
      return !!name && name !== locale.split("_")[0];
    } catch {
      return false;
    }
  });
  return cachedLocales;
}

/** The whole catalog with names in `uiLanguage`, sorted by name in that language. */
export function buildLanguageCatalog(uiLanguage: string): LanguageEntry[] {
  const collator = new Intl.Collator(toBcp47(uiLanguage));
  return catalogLocales()
    .map((locale) => ({ locale, flag: flagForLocale(locale), name: languageName(locale, uiLanguage) }))
    .sort((a, b) => collator.compare(a.name, b.name));
}

/** A language's name in itself, with its flag - how the player's switcher lists it. */
export function autonymLabel(locale: string): string {
  return `${flagForLocale(locale)} ${languageName(locale, toBcp47(locale))}`;
}
