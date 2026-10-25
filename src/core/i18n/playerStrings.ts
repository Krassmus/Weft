/**
 * The few fixed texts the player (and the editor's preview of it) shows by itself, in the languages a
 * module can be offered in: the quiz's "Abschicken" and its right/wrong feedback, the restart button,
 * message and results table of the finished screen, the default label of a button without text, and two
 * screen-reader labels. Everything an author types is translated by the author (see
 * core/document/translations.ts) - these are the rest.
 *
 * Only the more widely used languages are translated here (below); a language without an entry
 * falls back to English, which most learners can at least read. A module WITHOUT languages (`null`)
 * keeps the German these texts have always been in.
 */

export type PlayerStringKey = "submit" | "correct" | "incorrect" | "restart" | "done" | "next" | "play" | "language";

/** The texts of the files block (password field, download), kept apart from the ones above: a language
 * without its own entry here falls back to English. */
export type FilesStringKey = "filesTitle" | "filesPassword" | "filesUnlock" | "filesWrongPassword" | "filesDownload" | "filesFailed";

/** The texts for screen readers and keyboard users (the hidden navigation, the announcement of a slide, ...). {n} and {total} are filled in
 * by the player. A language without its own entry falls back to English. */
export type A11yStringKey = "previous" | "navigation" | "slide" | "blank" | "embedded" | "revealerOpen" | "revealerClose";

/** The texts of the table on the finished screen that lists what the graded elements (quizzes, gap texts) gave - see renderDoneSummary in
 * player.runtime.js. A language without its own entry falls back to English. */
export type ResultsStringKey = "resultsElement" | "resultsResult" | "resultsPoints" | "resultsTotal" | "resultsRight" | "resultsWrong" | "resultsAnswered" | "resultsOpen" | "resultsAdjustment";

type Strings = Record<PlayerStringKey | FilesStringKey | A11yStringKey | ResultsStringKey | "thanks", string>;

/** What an open question (no right or wrong, see QuizBlock.open) says once it is submitted. A language without its own falls back to English. */
const THANKS: Record<string, string> = {
  de: "Danke!", en: "Thank you!", fr: "Merci !", es: "¡Gracias!", it: "Grazie!", pt: "Obrigado!", ca: "Gràcies!", nl: "Bedankt!", sv: "Tack!",
  da: "Tak!", nb: "Takk!", fi: "Kiitos!", pl: "Dziękujemy!", cs: "Děkujeme!", sk: "Ďakujeme!", hu: "Köszönjük!", ro: "Mulțumim!", bg: "Благодарим!",
  hr: "Hvala!", ru: "Спасибо!", uk: "Дякуємо!", el: "Ευχαριστούμε!", tr: "Teşekkürler!", ar: "شكرًا!", he: "תודה!", hi: "धन्यवाद!", zh: "谢谢！",
  zh_TW: "謝謝！", ja: "ありがとうございます！", ko: "감사합니다!", id: "Terima kasih!", vi: "Cảm ơn bạn!", th: "ขอบคุณ!",
};

function a11yStrings(previous: string, navigation: string, slide: string, blank: string, embedded: string, revealerOpen: string, revealerClose: string): Record<A11yStringKey, string> {
  return { previous, navigation, slide, blank, embedded, revealerOpen, revealerClose };
}

const A11Y_TRANSLATIONS: Record<string, Record<A11yStringKey, string>> = {
  de: a11yStrings("Zurück", "Navigation", "Folie {n}", "Lücke {n} von {total}", "Eingebettete Seite", "Mehr Informationen anzeigen", "Schließen"),
  en: a11yStrings("Back", "Navigation", "Slide {n}", "Blank {n} of {total}", "Embedded page", "Show more information", "Close"),
  fr: a11yStrings("Retour", "Navigation", "Diapositive {n}", "Trou {n} sur {total}", "Page intégrée", "Afficher plus d'informations", "Fermer"),
  es: a11yStrings("Atrás", "Navegación", "Diapositiva {n}", "Hueco {n} de {total}", "Página incrustada", "Mostrar más información", "Cerrar"),
  it: a11yStrings("Indietro", "Navigazione", "Diapositiva {n}", "Spazio {n} di {total}", "Pagina incorporata", "Mostra più informazioni", "Chiudi"),
  pt: a11yStrings("Voltar", "Navegação", "Diapositivo {n}", "Lacuna {n} de {total}", "Página incorporada", "Mostrar mais informações", "Fechar"),
  nl: a11yStrings("Terug", "Navigatie", "Dia {n}", "Open plek {n} van {total}", "Ingebedde pagina", "Meer informatie tonen", "Sluiten"),
};

function resultsStrings(element: string, result: string, points: string, total: string, right: string, wrong: string, answered: string, open: string, adjustment: string): Record<ResultsStringKey, string> {
  return { resultsElement: element, resultsResult: result, resultsPoints: points, resultsTotal: total, resultsRight: right, resultsWrong: wrong, resultsAnswered: answered, resultsOpen: open, resultsAdjustment: adjustment };
}

const RESULTS_TRANSLATIONS: Record<string, Record<ResultsStringKey, string>> = {
  de: resultsStrings("Aufgabe", "Ergebnis", "Punkte", "Summe", "Richtig", "Falsch", "Beantwortet", "Nicht beantwortet", "Weitere Änderungen"),
  en: resultsStrings("Item", "Result", "Points", "Total", "Correct", "Incorrect", "Answered", "Not answered", "Other changes"),
  fr: resultsStrings("Élément", "Résultat", "Points", "Total", "Juste", "Faux", "Répondu", "Sans réponse", "Autres modifications"),
  es: resultsStrings("Elemento", "Resultado", "Puntos", "Total", "Correcto", "Incorrecto", "Respondido", "Sin responder", "Otros cambios"),
  it: resultsStrings("Elemento", "Risultato", "Punti", "Totale", "Corretto", "Sbagliato", "Risposto", "Senza risposta", "Altre modifiche"),
  pt: resultsStrings("Elemento", "Resultado", "Pontos", "Total", "Correto", "Errado", "Respondido", "Sem resposta", "Outras alterações"),
  nl: resultsStrings("Onderdeel", "Resultaat", "Punten", "Totaal", "Goed", "Fout", "Beantwoord", "Niet beantwoord", "Overige wijzigingen"),
};

function filesStrings(title: string, password: string, unlock: string, wrongPassword: string, download: string, failed: string): Record<FilesStringKey, string> {
  return { filesTitle: title, filesPassword: password, filesUnlock: unlock, filesWrongPassword: wrongPassword, filesDownload: download, filesFailed: failed };
}

const FILES_TRANSLATIONS: Record<string, Record<FilesStringKey, string>> = {
  de: filesStrings("Dateien", "Passwort", "Öffnen", "Falsches Passwort.", "Herunterladen", "Der Download hat nicht geklappt."),
  en: filesStrings("Files", "Password", "Unlock", "Wrong password.", "Download", "The download did not work."),
  fr: filesStrings("Fichiers", "Mot de passe", "Ouvrir", "Mot de passe incorrect.", "Télécharger", "Le téléchargement a échoué."),
  es: filesStrings("Archivos", "Contraseña", "Abrir", "Contraseña incorrecta.", "Descargar", "La descarga no funcionó."),
  it: filesStrings("File", "Password", "Apri", "Password errata.", "Scarica", "Il download non è riuscito."),
};

function strings(
  submit: string,
  correct: string,
  incorrect: string,
  restart: string,
  done: string,
  next: string,
  play: string,
  language: string,
): Strings {
  return { submit, correct, incorrect, restart, done, next, play, language, thanks: THANKS.en, ...FILES_TRANSLATIONS.en, ...A11Y_TRANSLATIONS.en, ...RESULTS_TRANSLATIONS.en };
}

// Keyed by language code (the part of a locale before the "_"); Chinese is also keyed by "zh_TW" for
// the traditional script.
const TRANSLATIONS: Record<string, Strings> = {
  de: strings("Abschicken", "Das war richtig!", "Das war leider nicht richtig.", "Neu starten", "Danke fürs Mitmachen!", "Weiter", "Abspielen", "Sprache"),
  en: strings("Submit", "That was correct!", "Unfortunately, that was not correct.", "Start over", "Thanks for taking part!", "Next", "Play", "Language"),
  fr: strings("Envoyer", "C'est correct !", "Malheureusement, ce n'est pas correct.", "Recommencer", "Merci d'avoir participé !", "Suivant", "Lire", "Langue"),
  es: strings("Enviar", "¡Correcto!", "Lamentablemente, no es correcto.", "Empezar de nuevo", "¡Gracias por participar!", "Siguiente", "Reproducir", "Idioma"),
  it: strings("Invia", "Esatto!", "Purtroppo non è corretto.", "Ricomincia", "Grazie per aver partecipato!", "Avanti", "Riproduci", "Lingua"),
  pt: strings("Enviar", "Correto!", "Infelizmente, não está correto.", "Recomeçar", "Obrigado por participar!", "Continuar", "Reproduzir", "Idioma"),
  ca: strings("Envia", "Correcte!", "Malauradament, no és correcte.", "Torna a començar", "Gràcies per participar!", "Següent", "Reprodueix", "Llengua"),
  nl: strings("Verzenden", "Dat was juist!", "Helaas, dat was niet juist.", "Opnieuw beginnen", "Bedankt voor het meedoen!", "Volgende", "Afspelen", "Taal"),
  sv: strings("Skicka", "Rätt!", "Tyvärr, det var inte rätt.", "Börja om", "Tack för att du deltog!", "Nästa", "Spela upp", "Språk"),
  da: strings("Send", "Det var rigtigt!", "Desværre, det var ikke rigtigt.", "Start forfra", "Tak fordi du deltog!", "Næste", "Afspil", "Sprog"),
  nb: strings("Send inn", "Det var riktig!", "Dessverre, det var ikke riktig.", "Start på nytt", "Takk for at du var med!", "Neste", "Spill av", "Språk"),
  fi: strings("Lähetä", "Oikein!", "Valitettavasti se ei ollut oikein.", "Aloita alusta", "Kiitos osallistumisesta!", "Seuraava", "Toista", "Kieli"),
  pl: strings("Wyślij", "Dobrze!", "Niestety, to nie jest poprawna odpowiedź.", "Zacznij od nowa", "Dziękujemy za udział!", "Dalej", "Odtwórz", "Język"),
  cs: strings("Odeslat", "Správně!", "Bohužel to není správně.", "Začít znovu", "Děkujeme za účast!", "Další", "Přehrát", "Jazyk"),
  sk: strings("Odoslať", "Správne!", "Žiaľ, nie je to správne.", "Začať odznova", "Ďakujeme za účasť!", "Ďalej", "Prehrať", "Jazyk"),
  hu: strings("Elküldés", "Helyes!", "Sajnos ez nem helyes.", "Újrakezdés", "Köszönjük a részvételt!", "Tovább", "Lejátszás", "Nyelv"),
  ro: strings("Trimite", "Corect!", "Din păcate, nu este corect.", "Reîncepe", "Mulțumim pentru participare!", "Înainte", "Redare", "Limbă"),
  bg: strings("Изпрати", "Вярно!", "За съжаление, това не е правилно.", "Започни отначало", "Благодарим за участието!", "Напред", "Възпроизвеждане", "Език"),
  hr: strings("Pošalji", "Točno!", "Nažalost, to nije točno.", "Počni ispočetka", "Hvala na sudjelovanju!", "Dalje", "Reproduciraj", "Jezik"),
  ru: strings("Отправить", "Правильно!", "К сожалению, это неправильно.", "Начать заново", "Спасибо за участие!", "Далее", "Воспроизвести", "Язык"),
  uk: strings("Надіслати", "Правильно!", "На жаль, це неправильно.", "Почати знову", "Дякуємо за участь!", "Далі", "Відтворити", "Мова"),
  el: strings("Υποβολή", "Σωστά!", "Δυστυχώς, δεν είναι σωστό.", "Έναρξη από την αρχή", "Ευχαριστούμε για τη συμμετοχή!", "Επόμενο", "Αναπαραγωγή", "Γλώσσα"),
  tr: strings("Gönder", "Doğru!", "Maalesef, doğru değil.", "Baştan başla", "Katıldığınız için teşekkürler!", "İleri", "Oynat", "Dil"),
  ar: strings("إرسال", "صحيح!", "للأسف، هذا غير صحيح.", "ابدأ من جديد", "شكرًا على مشاركتك!", "التالي", "تشغيل", "اللغة"),
  he: strings("שליחה", "נכון!", "למרבה הצער, זה לא נכון.", "התחל מחדש", "תודה על ההשתתפות!", "הבא", "הפעלה", "שפה"),
  hi: strings("जमा करें", "सही!", "दुर्भाग्य से, यह सही नहीं है।", "फिर से शुरू करें", "भाग लेने के लिए धन्यवाद!", "आगे", "चलाएँ", "भाषा"),
  zh: strings("提交", "正确！", "很遗憾，这不正确。", "重新开始", "感谢参与！", "下一步", "播放", "语言"),
  zh_TW: strings("送出", "正確！", "很遺憾，這不正確。", "重新開始", "感謝參與！", "下一步", "播放", "語言"),
  ja: strings("送信", "正解です！", "残念ながら、不正解です。", "最初からやり直す", "ご参加ありがとうございました！", "次へ", "再生", "言語"),
  ko: strings("제출", "정답입니다!", "아쉽게도 오답입니다.", "처음부터 다시", "참여해 주셔서 감사합니다!", "다음", "재생", "언어"),
  id: strings("Kirim", "Benar!", "Sayangnya, itu tidak benar.", "Mulai ulang", "Terima kasih sudah berpartisipasi!", "Berikutnya", "Putar", "Bahasa"),
  vi: strings("Gửi", "Chính xác!", "Rất tiếc, điều đó không đúng.", "Bắt đầu lại", "Cảm ơn bạn đã tham gia!", "Tiếp theo", "Phát", "Ngôn ngữ"),
  th: strings("ส่ง", "ถูกต้อง!", "น่าเสียดาย ไม่ถูกต้อง", "เริ่มใหม่", "ขอบคุณที่ร่วมกิจกรรม!", "ถัดไป", "เล่น", "ภาษา"),
};

// Languages whose texts are another language's: the two Norwegian written forms, and the Chinese
// regions that use the traditional script.
const ALIASES: Record<string, string> = { no: "nb", nn: "nb", zh_HK: "zh_TW", zh_MO: "zh_TW" };

/** The fixed texts for a locale ("fr_FR"): its own, else its language's, else English - and German
 * for `null`, a module without languages. */
export function playerStringsFor(locale: string | null): Strings {
  if (locale === null) return { ...TRANSLATIONS.de, ...FILES_TRANSLATIONS.de, ...A11Y_TRANSLATIONS.de, ...RESULTS_TRANSLATIONS.de, thanks: THANKS.de };
  const base = locale.split("_")[0];
  const key = [locale, base].map((k) => ALIASES[k] ?? k).find((k) => k in TRANSLATIONS);
  return {
    ...TRANSLATIONS[key ?? "en"],
    ...(FILES_TRANSLATIONS[key ?? "en"] ?? FILES_TRANSLATIONS.en),
    ...(A11Y_TRANSLATIONS[key ?? "en"] ?? A11Y_TRANSLATIONS.en),
    ...(RESULTS_TRANSLATIONS[key ?? "en"] ?? RESULTS_TRANSLATIONS.en),
    thanks: THANKS[key ?? "en"] ?? THANKS.en,
  };
}
