/**
 * The few fixed texts the player (and the editor's preview of it) shows by itself, in the languages a
 * module can be offered in: the quiz's "Abschicken" and its right/wrong feedback, the restart button
 * and message of the finished screen, the default label of a button without text, and two
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
export type FilesStringKey = "filesTitle" | "filesPassword" | "filesUnlock" | "filesWrongPassword" | "filesDownload" | "filesFailed" | "filesNoCrypto";

type Strings = Record<PlayerStringKey | FilesStringKey, string>;

function filesStrings(title: string, password: string, unlock: string, wrongPassword: string, download: string, failed: string, noCrypto: string): Record<FilesStringKey, string> {
  return { filesTitle: title, filesPassword: password, filesUnlock: unlock, filesWrongPassword: wrongPassword, filesDownload: download, filesFailed: failed, filesNoCrypto: noCrypto };
}

const FILES_TRANSLATIONS: Record<string, Record<FilesStringKey, string>> = {
  de: filesStrings("Dateien", "Passwort", "Öffnen", "Falsches Passwort.", "Herunterladen", "Der Download hat nicht geklappt.", "Dieser Browser kann hier nicht entschlüsseln (nur über https oder lokal)."),
  en: filesStrings("Files", "Password", "Unlock", "Wrong password.", "Download", "The download did not work.", "This browser cannot decrypt here (only over https or locally)."),
  fr: filesStrings("Fichiers", "Mot de passe", "Ouvrir", "Mot de passe incorrect.", "Télécharger", "Le téléchargement a échoué.", "Ce navigateur ne peut pas déchiffrer ici (seulement via https ou en local)."),
  es: filesStrings("Archivos", "Contraseña", "Abrir", "Contraseña incorrecta.", "Descargar", "La descarga no funcionó.", "Este navegador no puede descifrar aquí (solo mediante https o en local)."),
  it: filesStrings("File", "Password", "Apri", "Password errata.", "Scarica", "Il download non è riuscito.", "Questo browser non può decifrare qui (solo tramite https o in locale)."),
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
  return { submit, correct, incorrect, restart, done, next, play, language, ...FILES_TRANSLATIONS.en };
}

// Keyed by language code (the part of a locale before the "_"); Chinese is also keyed by "zh_TW" for
// the traditional script.
const TRANSLATIONS: Record<string, Strings> = {
  de: strings("Abschicken", "Das war richtig!", "Das war leider nicht richtig.", "Neu starten", "Lernmodul abgeschlossen.", "Weiter", "Abspielen", "Sprache"),
  en: strings("Submit", "That was correct!", "Unfortunately, that was not correct.", "Start over", "Module completed.", "Next", "Play", "Language"),
  fr: strings("Envoyer", "C'est correct !", "Malheureusement, ce n'est pas correct.", "Recommencer", "Module terminé.", "Suivant", "Lire", "Langue"),
  es: strings("Enviar", "¡Correcto!", "Lamentablemente, no es correcto.", "Empezar de nuevo", "Módulo completado.", "Siguiente", "Reproducir", "Idioma"),
  it: strings("Invia", "Esatto!", "Purtroppo non è corretto.", "Ricomincia", "Modulo completato.", "Avanti", "Riproduci", "Lingua"),
  pt: strings("Enviar", "Correto!", "Infelizmente, não está correto.", "Recomeçar", "Módulo concluído.", "Continuar", "Reproduzir", "Idioma"),
  ca: strings("Envia", "Correcte!", "Malauradament, no és correcte.", "Torna a començar", "Mòdul completat.", "Següent", "Reprodueix", "Llengua"),
  nl: strings("Verzenden", "Dat was juist!", "Helaas, dat was niet juist.", "Opnieuw beginnen", "Module voltooid.", "Volgende", "Afspelen", "Taal"),
  sv: strings("Skicka", "Rätt!", "Tyvärr, det var inte rätt.", "Börja om", "Modulen är klar.", "Nästa", "Spela upp", "Språk"),
  da: strings("Send", "Det var rigtigt!", "Desværre, det var ikke rigtigt.", "Start forfra", "Modulet er gennemført.", "Næste", "Afspil", "Sprog"),
  nb: strings("Send inn", "Det var riktig!", "Dessverre, det var ikke riktig.", "Start på nytt", "Modulen er fullført.", "Neste", "Spill av", "Språk"),
  fi: strings("Lähetä", "Oikein!", "Valitettavasti se ei ollut oikein.", "Aloita alusta", "Moduuli suoritettu.", "Seuraava", "Toista", "Kieli"),
  pl: strings("Wyślij", "Dobrze!", "Niestety, to nie jest poprawna odpowiedź.", "Zacznij od nowa", "Moduł ukończony.", "Dalej", "Odtwórz", "Język"),
  cs: strings("Odeslat", "Správně!", "Bohužel to není správně.", "Začít znovu", "Modul dokončen.", "Další", "Přehrát", "Jazyk"),
  sk: strings("Odoslať", "Správne!", "Žiaľ, nie je to správne.", "Začať odznova", "Modul dokončený.", "Ďalej", "Prehrať", "Jazyk"),
  hu: strings("Elküldés", "Helyes!", "Sajnos ez nem helyes.", "Újrakezdés", "A modul befejeződött.", "Tovább", "Lejátszás", "Nyelv"),
  ro: strings("Trimite", "Corect!", "Din păcate, nu este corect.", "Reîncepe", "Modul finalizat.", "Înainte", "Redare", "Limbă"),
  bg: strings("Изпрати", "Вярно!", "За съжаление, това не е правилно.", "Започни отначало", "Модулът е завършен.", "Напред", "Възпроизвеждане", "Език"),
  hr: strings("Pošalji", "Točno!", "Nažalost, to nije točno.", "Počni ispočetka", "Modul je završen.", "Dalje", "Reproduciraj", "Jezik"),
  ru: strings("Отправить", "Правильно!", "К сожалению, это неправильно.", "Начать заново", "Модуль завершён.", "Далее", "Воспроизвести", "Язык"),
  uk: strings("Надіслати", "Правильно!", "На жаль, це неправильно.", "Почати знову", "Модуль завершено.", "Далі", "Відтворити", "Мова"),
  el: strings("Υποβολή", "Σωστά!", "Δυστυχώς, δεν είναι σωστό.", "Έναρξη από την αρχή", "Η ενότητα ολοκληρώθηκε.", "Επόμενο", "Αναπαραγωγή", "Γλώσσα"),
  tr: strings("Gönder", "Doğru!", "Maalesef, doğru değil.", "Baştan başla", "Modül tamamlandı.", "İleri", "Oynat", "Dil"),
  ar: strings("إرسال", "صحيح!", "للأسف، هذا غير صحيح.", "ابدأ من جديد", "اكتملت الوحدة.", "التالي", "تشغيل", "اللغة"),
  he: strings("שליחה", "נכון!", "למרבה הצער, זה לא נכון.", "התחל מחדש", "היחידה הושלמה.", "הבא", "הפעלה", "שפה"),
  hi: strings("जमा करें", "सही!", "दुर्भाग्य से, यह सही नहीं है।", "फिर से शुरू करें", "मॉड्यूल पूरा हुआ।", "आगे", "चलाएँ", "भाषा"),
  zh: strings("提交", "正确！", "很遗憾，这不正确。", "重新开始", "学习模块已完成。", "下一步", "播放", "语言"),
  zh_TW: strings("送出", "正確！", "很遺憾，這不正確。", "重新開始", "學習單元已完成。", "下一步", "播放", "語言"),
  ja: strings("送信", "正解です！", "残念ながら、不正解です。", "最初からやり直す", "モジュールが完了しました。", "次へ", "再生", "言語"),
  ko: strings("제출", "정답입니다!", "아쉽게도 오답입니다.", "처음부터 다시", "모듈을 완료했습니다.", "다음", "재생", "언어"),
  id: strings("Kirim", "Benar!", "Sayangnya, itu tidak benar.", "Mulai ulang", "Modul selesai.", "Berikutnya", "Putar", "Bahasa"),
  vi: strings("Gửi", "Chính xác!", "Rất tiếc, điều đó không đúng.", "Bắt đầu lại", "Đã hoàn thành mô-đun.", "Tiếp theo", "Phát", "Ngôn ngữ"),
  th: strings("ส่ง", "ถูกต้อง!", "น่าเสียดาย ไม่ถูกต้อง", "เริ่มใหม่", "เรียนจบโมดูลแล้ว", "ถัดไป", "เล่น", "ภาษา"),
};

// Languages whose texts are another language's: the two Norwegian written forms, and the Chinese
// regions that use the traditional script.
const ALIASES: Record<string, string> = { no: "nb", nn: "nb", zh_HK: "zh_TW", zh_MO: "zh_TW" };

/** The fixed texts for a locale ("fr_FR"): its own, else its language's, else English - and German
 * for `null`, a module without languages. */
export function playerStringsFor(locale: string | null): Strings {
  if (locale === null) return { ...TRANSLATIONS.de, ...FILES_TRANSLATIONS.de };
  const base = locale.split("_")[0];
  const key = [locale, base].map((k) => ALIASES[k] ?? k).find((k) => k in TRANSLATIONS);
  return { ...TRANSLATIONS[key ?? "en"], ...(FILES_TRANSLATIONS[key ?? "en"] ?? FILES_TRANSLATIONS.en) };
}
