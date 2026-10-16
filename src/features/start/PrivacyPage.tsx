import { tr } from "../../core/i18n/tr";
import { useTranslation } from "../../core/i18n/useTranslation";

/**
 * "Datenschutz und Impressum": what Weft does and does not do with data, and who is behind it. The texts are written in both
 * languages (not through the string table: they are pages, not labels). The data of the person responsible for the app
 * (IMPRESSUM) is to be filled in before the app is handed on.
 */
const IMPRESSUM: string[] = ["[Name]", "[Straße und Hausnummer]", "[PLZ Ort]", "[E-Mail-Adresse]"];

type Section = { title: string; paragraphs: string[] };

const DE: { privacy: string; sections: Section[]; legalTitle: string; legalIntro: string; legalOutro: string } = {
  privacy: "Datenschutz",
  sections: [
    {
      title: "Kurz gesagt",
      paragraphs: [
        "Weft sammelt keine Daten über dich oder darüber, wie du Weft benutzt. Es gibt kein Konto, keine Anmeldung, keine Statistik, keine Telemetrie und keine Absturzberichte. Weft setzt keine Cookies, bindet keine Werbung und keine Skripte von Drittanbietern ein.",
      ],
    },
    {
      title: "Wo deine Lernmodule liegen",
      paragraphs: [
        "Deine Lernmodule sind Dateien auf deinem Gerät, in dem Ordner, den du beim Speichern wählst (auf dem iPad im Ordner „Weft“ der Dateien-App). Weft schickt sie nirgendwohin. Was du in Weft erstellst, bleibt bei dir, bis du es selbst weitergibst.",
      ],
    },
    {
      title: "Was auf deinem Gerät gemerkt wird",
      paragraphs: [
        "Damit Weft sich beim nächsten Start so zeigt, wie du es verlassen hast, merkt es sich ein paar Dinge im lokalen Speicher der App: die Sprache, die Liste der zuletzt geöffneten Dateien, deine Netzwerk-Einstellungen, den Namen und das Bild, mit denen du in der Zusammenarbeit erscheinst, und eine Wiederherstellungskopie eines Moduls, das noch nicht gespeichert ist. Diese Angaben verlassen dein Gerät nicht. Du entfernst sie, indem du die Daten der App löschst.",
      ],
    },
    {
      title: "Wann Weft das Netz benutzt",
      paragraphs: [
        "Nur wenn du es willst: Bei der Live-Zusammenarbeit verbindet sich Weft mit den anderen Personen, die denselben Einladungslink geöffnet haben - direkt oder über einen Server bzw. ein Relais, das du in den Einstellungen selbst einträgst. Dabei sehen die Beteiligten die Änderungen am Modul sowie den Namen und das Bild, die du dafür gewählt hast. Ohne diese Einstellungen verbindet sich Weft mit keinem Server.",
        "Die Synchronisation über einen gemeinsamen Ordner (zum Beispiel in einer Nextcloud) übernimmt das Betriebssystem bzw. dessen Synchronisations-Programm; Weft selbst schreibt dort nur Dateien.",
      ],
    },
    {
      title: "Lernmodule, die du weitergibst",
      paragraphs: [
        "Ein exportiertes Lernmodul ist eine eigene Webseite. Sie enthält nur, was du hineingelegt hast. Bettest du Inhalte von Dritten ein (zum Beispiel ein Video oder eine Webseite in einem Rahmen), lädt das Modul sie von dort - dafür gelten die Datenschutzbestimmungen dieser Anbieter, und du solltest die Lernenden darauf hinweisen. Wird das Modul in ein Lernmanagementsystem eingebunden, kann es Lernstände (zum Beispiel Punkte) an dieses melden; ohne ein solches System geschieht nichts.",
      ],
    },
  ],
  legalTitle: "Impressum",
  legalIntro: "Verantwortlich für Weft:",
  legalOutro: "Fragen zum Datenschutz richtest du an dieselbe Adresse.",
};

const EN: typeof DE = {
  privacy: "Privacy",
  sections: [
    {
      title: "In short",
      paragraphs: [
        "Weft collects no data about you or about how you use Weft. There is no account, no sign-in, no statistics, no telemetry and no crash reports. Weft sets no cookies and includes no advertising and no third-party scripts.",
      ],
    },
    {
      title: "Where your learning modules are",
      paragraphs: [
        "Your learning modules are files on your device, in the folder you choose when you save (on the iPad: the “Weft” folder in the Files app). Weft sends them nowhere. What you create in Weft stays with you until you hand it on yourself.",
      ],
    },
    {
      title: "What is remembered on your device",
      paragraphs: [
        "So that Weft looks the next time the way you left it, it remembers a few things in the app’s local storage: the language, the list of recently opened files, your network settings, the name and picture you appear with when working together, and a recovery copy of a module that has not been saved yet. None of this leaves your device. You remove it by deleting the app’s data.",
      ],
    },
    {
      title: "When Weft uses the network",
      paragraphs: [
        "Only when you want it to: with live collaboration, Weft connects to the other people who opened the same invitation link - directly, or through a server or relay that you enter in the settings yourself. The people taking part see the changes to the module and the name and picture you chose for it. Without these settings, Weft connects to no server.",
        "Synchronization through a shared folder (in a Nextcloud, for example) is done by the operating system or its sync program; Weft itself only writes files there.",
      ],
    },
    {
      title: "Learning modules you hand on",
      paragraphs: [
        "An exported learning module is a web page of its own. It contains only what you put into it. If you embed content from third parties (a video or a web page in a frame, for example), the module loads it from there - the privacy policies of those providers apply, and you should tell your learners. If the module is embedded in a learning management system, it can report progress (points, for example) to it; without such a system nothing happens.",
      ],
    },
  ],
  legalTitle: "Legal notice",
  legalIntro: "Responsible for Weft:",
  legalOutro: "Questions about privacy go to the same address.",
};

export function PrivacyPage({ onBack }: { onBack: () => void }) {
  const { lang } = useTranslation();
  const text = lang === "de" ? DE : EN;
  return (
    <article className="weft-start-legal">
      <button type="button" className="weft-start-link" onClick={onBack}>
        ← {tr("ui.start_back")}
      </button>
      <h1>
        {text.privacy} &amp; {text.legalTitle}
      </h1>
      {text.sections.map((section) => (
        <section key={section.title}>
          <h2>{section.title}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph.slice(0, 24)}>{paragraph}</p>
          ))}
        </section>
      ))}
      <section>
        <h2>{text.legalTitle}</h2>
        <p>{text.legalIntro}</p>
        <address>
          {IMPRESSUM.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </address>
        <p>{text.legalOutro}</p>
      </section>
    </article>
  );
}
