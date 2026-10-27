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
export type A11yStringKey = "previous" | "navigation" | "slide" | "blank" | "embedded" | "revealerOpen" | "revealerClose" | "requiredFirst" | "matchingPicked" | "matchingAssigned" | "sortPicked" | "sortMoved";

/** The texts of the table on the finished screen that lists what the graded elements (quizzes, gap texts) gave - see renderDoneSummary in
 * player.runtime.js. A language without its own entry falls back to English. */
export type ResultsStringKey = "resultsElement" | "resultsResult" | "resultsPoints" | "resultsTotal" | "resultsRight" | "resultsWrong" | "resultsAnswered" | "resultsOpen" | "resultsAdjustment" | "resultsTicked" | "resultsUnticked";

/** The texts of the certificate (a PDF of the finished screen's table, see renderCertificate in player.runtime.js): its heading and the button that
 * downloads it. A language without its own entry falls back to English. */
export type CertificateStringKey = "certificateTitle" | "certificateDownload";

/** The texts of a gallery's carousel for screen readers and the arrows' tooltips: the two arrows and the position of a picture ({n} and {total} are filled
 * in by the player). A language without its own entry falls back to English. */
export type GalleryStringKey = "galleryPrevious" | "galleryNext" | "galleryPicture";

type Strings = Record<PlayerStringKey | FilesStringKey | A11yStringKey | ResultsStringKey | CertificateStringKey | GalleryStringKey | "thanks", string>;

/** What an open question (no right or wrong, see QuizBlock.open) says once it is submitted. A language without its own falls back to English. */
const THANKS: Record<string, string> = {
  de: "Danke!", en: "Thank you!", fr: "Merci !", es: "¡Gracias!", it: "Grazie!", pt: "Obrigado!", ca: "Gràcies!", nl: "Bedankt!", sv: "Tack!",
  da: "Tak!", nb: "Takk!", fi: "Kiitos!", pl: "Dziękujemy!", cs: "Děkujeme!", sk: "Ďakujeme!", hu: "Köszönjük!", ro: "Mulțumim!", bg: "Благодарим!",
  hr: "Hvala!", ru: "Спасибо!", uk: "Дякуємо!", el: "Ευχαριστούμε!", tr: "Teşekkürler!", ar: "شكرًا!", he: "תודה!", hi: "धन्यवाद!", zh: "谢谢！",
  zh_TW: "謝謝！", ja: "ありがとうございます！", ko: "감사합니다!", id: "Terima kasih!", vi: "Cảm ơn bạn!", th: "ขอบคุณ!",
};

function a11yStrings(previous: string, navigation: string, slide: string, blank: string, embedded: string, revealerOpen: string, revealerClose: string, requiredFirst: string, matchingPicked: string, matchingAssigned: string, sortPicked: string, sortMoved: string): Record<A11yStringKey, string> {
  return { previous, navigation, slide, blank, embedded, revealerOpen, revealerClose, requiredFirst, matchingPicked, matchingAssigned, sortPicked, sortMoved };
}

const A11Y_TRANSLATIONS: Record<string, Record<A11yStringKey, string>> = {
  de: a11yStrings("Zurück", "Navigation", "Folie {n}", "Lücke {n} von {total}", "Eingebettete Seite", "Mehr Informationen anzeigen", "Schließen", "Bitte zuerst die Aufgabe abschicken.", "Ausgewählt. Wähle jetzt ein Ziel.", "Zugeordnet.", "Aufgenommen. Verschiebe mit den Pfeiltasten, bestätige mit Enter.", "Platz {n} von {total}."),
  en: a11yStrings("Back", "Navigation", "Slide {n}", "Blank {n} of {total}", "Embedded page", "Show more information", "Close", "Please submit the task first.", "Picked up. Now choose a target.", "Assigned.", "Picked up. Move it with the arrow keys, confirm with Enter.", "Place {n} of {total}."),
  fr: a11yStrings("Retour", "Navigation", "Diapositive {n}", "Trou {n} sur {total}", "Page intégrée", "Afficher plus d'informations", "Fermer", "Veuillez d'abord envoyer l'exercice.", "Sélectionné. Choisissez maintenant une cible.", "Associé.", "Sélectionné. Déplacez-le avec les flèches, validez avec Entrée.", "Position {n} sur {total}."),
  es: a11yStrings("Atrás", "Navegación", "Diapositiva {n}", "Hueco {n} de {total}", "Página incrustada", "Mostrar más información", "Cerrar", "Envía primero la tarea.", "Seleccionado. Elige ahora un destino.", "Asignado.", "Seleccionado. Muévelo con las flechas, confirma con Intro.", "Posición {n} de {total}."),
  it: a11yStrings("Indietro", "Navigazione", "Diapositiva {n}", "Spazio {n} di {total}", "Pagina incorporata", "Mostra più informazioni", "Chiudi", "Invia prima l'esercizio.", "Selezionato. Scegli ora una destinazione.", "Assegnato.", "Selezionato. Spostalo con le frecce, conferma con Invio.", "Posizione {n} di {total}."),
  pt: a11yStrings("Voltar", "Navegação", "Diapositivo {n}", "Lacuna {n} de {total}", "Página incorporada", "Mostrar mais informações", "Fechar", "Envie primeiro a tarefa.", "Selecionado. Escolha agora um destino.", "Atribuído.", "Selecionado. Mova-o com as setas, confirme com Enter.", "Posição {n} de {total}."),
  nl: a11yStrings("Terug", "Navigatie", "Dia {n}", "Open plek {n} van {total}", "Ingebedde pagina", "Meer informatie tonen", "Sluiten", "Verstuur eerst de opdracht.", "Gekozen. Kies nu een doel.", "Toegewezen.", "Gekozen. Verplaats met de pijltjestoetsen, bevestig met Enter.", "Plaats {n} van {total}."),
};

function resultsStrings(element: string, result: string, points: string, total: string, right: string, wrong: string, answered: string, open: string, adjustment: string, ticked: string, unticked: string): Record<ResultsStringKey, string> {
  return { resultsElement: element, resultsResult: result, resultsPoints: points, resultsTotal: total, resultsRight: right, resultsWrong: wrong, resultsAnswered: answered, resultsOpen: open, resultsAdjustment: adjustment, resultsTicked: ticked, resultsUnticked: unticked };
}

const RESULTS_TRANSLATIONS: Record<string, Record<ResultsStringKey, string>> = {
  de: resultsStrings("Aufgabe", "Ergebnis", "Punkte", "Summe", "Richtig", "Falsch", "Beantwortet", "Nicht beantwortet", "Weitere Änderungen", "Mit Haken", "Ohne Haken"),
  en: resultsStrings("Item", "Result", "Points", "Total", "Correct", "Incorrect", "Answered", "Not answered", "Other changes", "Ticked", "Not ticked"),
  fr: resultsStrings("Élément", "Résultat", "Points", "Total", "Juste", "Faux", "Répondu", "Sans réponse", "Autres modifications", "Coché", "Non coché"),
  es: resultsStrings("Elemento", "Resultado", "Puntos", "Total", "Correcto", "Incorrecto", "Respondido", "Sin responder", "Otros cambios", "Marcado", "Sin marcar"),
  it: resultsStrings("Elemento", "Risultato", "Punti", "Totale", "Corretto", "Sbagliato", "Risposto", "Senza risposta", "Altre modifiche", "Selezionato", "Non selezionato"),
  pt: resultsStrings("Elemento", "Resultado", "Pontos", "Total", "Correto", "Errado", "Respondido", "Sem resposta", "Outras alterações", "Marcado", "Não marcado"),
  nl: resultsStrings("Onderdeel", "Resultaat", "Punten", "Totaal", "Goed", "Fout", "Beantwoord", "Niet beantwoord", "Overige wijzigingen", "Aangevinkt", "Niet aangevinkt"),
  ca: resultsStrings("Element", "Resultat", "Punts", "Total", "Correcte", "Incorrecte", "Respost", "Sense resposta", "Altres canvis", "Marcat", "Sense marcar"),
  sv: resultsStrings("Uppgift", "Resultat", "Poäng", "Summa", "Rätt", "Fel", "Besvarad", "Obesvarad", "Övriga ändringar", "Ikryssad", "Ej ikryssad"),
  da: resultsStrings("Opgave", "Resultat", "Point", "I alt", "Rigtigt", "Forkert", "Besvaret", "Ikke besvaret", "Andre ændringer", "Afkrydset", "Ikke afkrydset"),
  nb: resultsStrings("Oppgave", "Resultat", "Poeng", "Sum", "Riktig", "Feil", "Besvart", "Ikke besvart", "Andre endringer", "Avkrysset", "Ikke avkrysset"),
  fi: resultsStrings("Tehtävä", "Tulos", "Pisteet", "Yhteensä", "Oikein", "Väärin", "Vastattu", "Ei vastattu", "Muut muutokset", "Valittu", "Ei valittu"),
  pl: resultsStrings("Zadanie", "Wynik", "Punkty", "Suma", "Poprawnie", "Niepoprawnie", "Udzielono odpowiedzi", "Bez odpowiedzi", "Inne zmiany", "Zaznaczono", "Nie zaznaczono"),
  cs: resultsStrings("Úloha", "Výsledek", "Body", "Celkem", "Správně", "Špatně", "Zodpovězeno", "Nezodpovězeno", "Další změny", "Zaškrtnuto", "Nezaškrtnuto"),
  sk: resultsStrings("Úloha", "Výsledok", "Body", "Spolu", "Správne", "Nesprávne", "Zodpovedané", "Nezodpovedané", "Ďalšie zmeny", "Zaškrtnuté", "Nezaškrtnuté"),
  hu: resultsStrings("Feladat", "Eredmény", "Pontok", "Összesen", "Helyes", "Helytelen", "Megválaszolva", "Megválaszolatlan", "Egyéb változások", "Bejelölve", "Nincs bejelölve"),
  ro: resultsStrings("Sarcină", "Rezultat", "Puncte", "Total", "Corect", "Greșit", "Cu răspuns", "Fără răspuns", "Alte modificări", "Bifat", "Nebifat"),
  bg: resultsStrings("Задача", "Резултат", "Точки", "Общо", "Вярно", "Грешно", "Отговорено", "Без отговор", "Други промени", "Отметнато", "Неотметнато"),
  hr: resultsStrings("Zadatak", "Rezultat", "Bodovi", "Ukupno", "Točno", "Netočno", "Odgovoreno", "Bez odgovora", "Ostale promjene", "Označeno", "Neoznačeno"),
  ru: resultsStrings("Задание", "Результат", "Баллы", "Итого", "Верно", "Неверно", "Отвечено", "Нет ответа", "Прочие изменения", "Отмечено", "Не отмечено"),
  uk: resultsStrings("Завдання", "Результат", "Бали", "Разом", "Правильно", "Неправильно", "Є відповідь", "Без відповіді", "Інші зміни", "Позначено", "Не позначено"),
  el: resultsStrings("Εργασία", "Αποτέλεσμα", "Βαθμοί", "Σύνολο", "Σωστό", "Λάθος", "Απαντήθηκε", "Δεν απαντήθηκε", "Άλλες αλλαγές", "Επιλεγμένο", "Μη επιλεγμένο"),
  tr: resultsStrings("Görev", "Sonuç", "Puan", "Toplam", "Doğru", "Yanlış", "Yanıtlandı", "Yanıtlanmadı", "Diğer değişiklikler", "İşaretli", "İşaretsiz"),
  ar: resultsStrings("المهمة", "النتيجة", "النقاط", "المجموع", "صحيح", "خطأ", "تمت الإجابة", "لم تتم الإجابة", "تغييرات أخرى", "محدد", "غير محدد"),
  he: resultsStrings("משימה", "תוצאה", "נקודות", "סה״כ", "נכון", "שגוי", "נענה", "לא נענה", "שינויים נוספים", "מסומן", "לא מסומן"),
  hi: resultsStrings("कार्य", "परिणाम", "अंक", "कुल", "सही", "गलत", "उत्तर दिया गया", "उत्तर नहीं दिया गया", "अन्य बदलाव", "चिह्नित", "अचिह्नित"),
  zh: resultsStrings("题目", "结果", "得分", "总计", "正确", "错误", "已回答", "未回答", "其他变动", "已勾选", "未勾选"),
  zh_TW: resultsStrings("題目", "結果", "得分", "總計", "正確", "錯誤", "已回答", "未回答", "其他變動", "已勾選", "未勾選"),
  ja: resultsStrings("課題", "結果", "得点", "合計", "正解", "不正解", "回答済み", "未回答", "その他の変更", "チェックあり", "チェックなし"),
  ko: resultsStrings("과제", "결과", "점수", "합계", "정답", "오답", "응답함", "응답 안 함", "기타 변경", "선택함", "선택 안 함"),
  id: resultsStrings("Tugas", "Hasil", "Poin", "Total", "Benar", "Salah", "Dijawab", "Belum dijawab", "Perubahan lainnya", "Dicentang", "Tidak dicentang"),
  vi: resultsStrings("Bài tập", "Kết quả", "Điểm", "Tổng", "Đúng", "Sai", "Đã trả lời", "Chưa trả lời", "Thay đổi khác", "Đã chọn", "Chưa chọn"),
  th: resultsStrings("งาน", "ผลลัพธ์", "คะแนน", "รวม", "ถูกต้อง", "ไม่ถูกต้อง", "ตอบแล้ว", "ยังไม่ตอบ", "การเปลี่ยนแปลงอื่น ๆ", "ติ๊กแล้ว", "ไม่ได้ติ๊ก"),
};

const CERTIFICATE_TRANSLATIONS: Record<string, Record<CertificateStringKey, string>> = {
  de: { certificateTitle: "Weft-Zertifikat", certificateDownload: "Zertifikat herunterladen" },
  en: { certificateTitle: "Weft Certificate", certificateDownload: "Download certificate" },
  fr: { certificateTitle: "Certificat Weft", certificateDownload: "Télécharger le certificat" },
  es: { certificateTitle: "Certificado Weft", certificateDownload: "Descargar certificado" },
  it: { certificateTitle: "Certificato Weft", certificateDownload: "Scarica il certificato" },
  pt: { certificateTitle: "Certificado Weft", certificateDownload: "Descarregar certificado" },
  nl: { certificateTitle: "Weft-certificaat", certificateDownload: "Certificaat downloaden" },
  ca: { certificateTitle: "Certificat Weft", certificateDownload: "Baixa el certificat" },
  sv: { certificateTitle: "Weft-certifikat", certificateDownload: "Ladda ner certifikat" },
  da: { certificateTitle: "Weft-certifikat", certificateDownload: "Download certifikat" },
  nb: { certificateTitle: "Weft-sertifikat", certificateDownload: "Last ned sertifikat" },
  fi: { certificateTitle: "Weft-todistus", certificateDownload: "Lataa todistus" },
  pl: { certificateTitle: "Certyfikat Weft", certificateDownload: "Pobierz certyfikat" },
  cs: { certificateTitle: "Certifikát Weft", certificateDownload: "Stáhnout certifikát" },
  sk: { certificateTitle: "Certifikát Weft", certificateDownload: "Stiahnuť certifikát" },
  hu: { certificateTitle: "Weft-tanúsítvány", certificateDownload: "Tanúsítvány letöltése" },
  ro: { certificateTitle: "Certificat Weft", certificateDownload: "Descarcă certificatul" },
  bg: { certificateTitle: "Сертификат Weft", certificateDownload: "Изтегляне на сертификата" },
  hr: { certificateTitle: "Weft certifikat", certificateDownload: "Preuzmi certifikat" },
  ru: { certificateTitle: "Сертификат Weft", certificateDownload: "Скачать сертификат" },
  uk: { certificateTitle: "Сертифікат Weft", certificateDownload: "Завантажити сертифікат" },
  el: { certificateTitle: "Πιστοποιητικό Weft", certificateDownload: "Λήψη πιστοποιητικού" },
  tr: { certificateTitle: "Weft Sertifikası", certificateDownload: "Sertifikayı indir" },
  ar: { certificateTitle: "شهادة Weft", certificateDownload: "تنزيل الشهادة" },
  he: { certificateTitle: "תעודת Weft", certificateDownload: "הורדת התעודה" },
  hi: { certificateTitle: "Weft प्रमाणपत्र", certificateDownload: "प्रमाणपत्र डाउनलोड करें" },
  zh: { certificateTitle: "Weft 证书", certificateDownload: "下载证书" },
  zh_TW: { certificateTitle: "Weft 證書", certificateDownload: "下載證書" },
  ja: { certificateTitle: "Weft 証明書", certificateDownload: "証明書をダウンロード" },
  ko: { certificateTitle: "Weft 인증서", certificateDownload: "인증서 다운로드" },
  id: { certificateTitle: "Sertifikat Weft", certificateDownload: "Unduh sertifikat" },
  vi: { certificateTitle: "Chứng chỉ Weft", certificateDownload: "Tải chứng chỉ" },
  th: { certificateTitle: "ใบรับรอง Weft", certificateDownload: "ดาวน์โหลดใบรับรอง" },
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

function galleryStrings(previous: string, next: string, picture: string): Record<GalleryStringKey, string> {
  return { galleryPrevious: previous, galleryNext: next, galleryPicture: picture };
}

const GALLERY_TRANSLATIONS: Record<string, Record<GalleryStringKey, string>> = {
  de: galleryStrings("Vorheriges Bild", "Nächstes Bild", "Bild {n} von {total}"),
  en: galleryStrings("Previous picture", "Next picture", "Picture {n} of {total}"),
  fr: galleryStrings("Image précédente", "Image suivante", "Image {n} sur {total}"),
  es: galleryStrings("Imagen anterior", "Imagen siguiente", "Imagen {n} de {total}"),
  it: galleryStrings("Immagine precedente", "Immagine successiva", "Immagine {n} di {total}"),
  pt: galleryStrings("Imagem anterior", "Imagem seguinte", "Imagem {n} de {total}"),
  ca: galleryStrings("Imatge anterior", "Imatge següent", "Imatge {n} de {total}"),
  nl: galleryStrings("Vorige afbeelding", "Volgende afbeelding", "Afbeelding {n} van {total}"),
  sv: galleryStrings("Föregående bild", "Nästa bild", "Bild {n} av {total}"),
  da: galleryStrings("Forrige billede", "Næste billede", "Billede {n} af {total}"),
  nb: galleryStrings("Forrige bilde", "Neste bilde", "Bilde {n} av {total}"),
  fi: galleryStrings("Edellinen kuva", "Seuraava kuva", "Kuva {n} / {total}"),
  pl: galleryStrings("Poprzedni obraz", "Następny obraz", "Obraz {n} z {total}"),
  cs: galleryStrings("Předchozí obrázek", "Další obrázek", "Obrázek {n} z {total}"),
  sk: galleryStrings("Predchádzajúci obrázok", "Ďalší obrázok", "Obrázok {n} z {total}"),
  hu: galleryStrings("Előző kép", "Következő kép", "{n}. kép, összesen {total}"),
  ro: galleryStrings("Imaginea anterioară", "Imaginea următoare", "Imaginea {n} din {total}"),
  bg: galleryStrings("Предишна снимка", "Следваща снимка", "Снимка {n} от {total}"),
  hr: galleryStrings("Prethodna slika", "Sljedeća slika", "Slika {n} od {total}"),
  ru: galleryStrings("Предыдущее изображение", "Следующее изображение", "Изображение {n} из {total}"),
  uk: galleryStrings("Попереднє зображення", "Наступне зображення", "Зображення {n} з {total}"),
  el: galleryStrings("Προηγούμενη εικόνα", "Επόμενη εικόνα", "Εικόνα {n} από {total}"),
  tr: galleryStrings("Önceki görsel", "Sonraki görsel", "Görsel {n} / {total}"),
  ar: galleryStrings("الصورة السابقة", "الصورة التالية", "الصورة {n} من {total}"),
  he: galleryStrings("התמונה הקודמת", "התמונה הבאה", "תמונה {n} מתוך {total}"),
  hi: galleryStrings("पिछली तस्वीर", "अगली तस्वीर", "तस्वीर {n} / {total}"),
  zh: galleryStrings("上一张图片", "下一张图片", "第 {n} 张，共 {total} 张"),
  zh_TW: galleryStrings("上一張圖片", "下一張圖片", "第 {n} 張，共 {total} 張"),
  ja: galleryStrings("前の画像", "次の画像", "画像 {n} / {total}"),
  ko: galleryStrings("이전 이미지", "다음 이미지", "이미지 {n} / {total}"),
  id: galleryStrings("Gambar sebelumnya", "Gambar berikutnya", "Gambar {n} dari {total}"),
  vi: galleryStrings("Ảnh trước", "Ảnh tiếp theo", "Ảnh {n} trên {total}"),
  th: galleryStrings("รูปก่อนหน้า", "รูปถัดไป", "รูปที่ {n} จาก {total}"),
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
  return { submit, correct, incorrect, restart, done, next, play, language, thanks: THANKS.en, ...FILES_TRANSLATIONS.en, ...A11Y_TRANSLATIONS.en, ...RESULTS_TRANSLATIONS.en, ...CERTIFICATE_TRANSLATIONS.en, ...GALLERY_TRANSLATIONS.en };
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
  if (locale === null) return { ...TRANSLATIONS.de, ...FILES_TRANSLATIONS.de, ...A11Y_TRANSLATIONS.de, ...RESULTS_TRANSLATIONS.de, ...CERTIFICATE_TRANSLATIONS.de, ...GALLERY_TRANSLATIONS.de, thanks: THANKS.de };
  const base = locale.split("_")[0];
  const key = [locale, base].map((k) => ALIASES[k] ?? k).find((k) => k in TRANSLATIONS);
  return {
    ...TRANSLATIONS[key ?? "en"],
    ...(FILES_TRANSLATIONS[key ?? "en"] ?? FILES_TRANSLATIONS.en),
    ...(A11Y_TRANSLATIONS[key ?? "en"] ?? A11Y_TRANSLATIONS.en),
    ...(RESULTS_TRANSLATIONS[key ?? "en"] ?? RESULTS_TRANSLATIONS.en),
    ...(CERTIFICATE_TRANSLATIONS[key ?? "en"] ?? CERTIFICATE_TRANSLATIONS.en),
    ...(GALLERY_TRANSLATIONS[key ?? "en"] ?? GALLERY_TRANSLATIONS.en),
    thanks: THANKS[key ?? "en"] ?? THANKS.en,
  };
}
