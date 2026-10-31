import { openUrl } from "@tauri-apps/plugin-opener";
import { tr } from "../../core/i18n/tr";
import { runsInTauri } from "../../core/platform";
import { useTranslation } from "../../core/i18n/useTranslation";

/**
 * "Datenschutz und Impressum": what Weft does and does not do with data, and who is behind it. The texts are written in both
 * languages (not through the string table: they are pages, not labels).
 */
const IMPRESSUM: string[] = ["Rasmus Fuhse", "Pastor-Sander-Bogen 45", "37083 Göttingen"];
const EMAIL = "krassmus@gmail.com";
const DISCORD_URL = "https://discord.gg/qvYT9q6grg";

type Section = { title: string; paragraphs: string[] };
type Texts = { privacy: string; sections: Section[]; legalTitle: string; legalIntro: string; legalOutro: string; supportTitle: string; supportText: string; supportLink: string; supportNote: string };

const DE: Texts = {
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
        "Nur wenn du es willst: Bei der Live-Zusammenarbeit verbindet sich Weft mit den anderen Personen, die denselben Einladungslink geöffnet haben. Die Inhalte des Moduls gehen dabei von Gerät zu Gerät (WebRTC); nur wenn du in den Einstellungen einen TURN-Server einträgst, können sie über diesen laufen. Dabei sehen die Beteiligten die Änderungen am Modul sowie den Namen und das Bild, die du dafür gewählt hast.",
        "Damit die Geräte sich finden, nutzt Weft für die Live-Zusammenarbeit öffentliche Hilfsdienste, solange du nichts anderes einträgst: Nostr-Relays, über die sich die Geräte verabreden (dort liegen nur verschlüsselte Verbindungsangaben, keine Modulinhalte), und öffentliche STUN-Server von Google und Cloudflare, bei denen ein Gerät erfährt, unter welcher Adresse es im Internet erreichbar ist. Diese Dienste sehen die IP-Adresse deines Geräts. Die Relais kannst du in den Einstellungen durch eigene ersetzen. Ohne Live-Zusammenarbeit verbindet sich Weft mit keinem dieser Dienste.",
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
  supportTitle: "Support",
  supportText: "Support gibt es über einen Discord-Server: Fragen stellen, Fehler melden, Ideen besprechen.",
  supportLink: "Zum Discord-Server",
  supportNote: "Der Link führt zu Discord, einem Dienst eines Drittanbieters - dort gelten dessen Nutzungs- und Datenschutzbestimmungen. Weft selbst verbindet sich nicht mit Discord.",
};

const EN: Texts = {
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
        "Only when you want it to: with live collaboration, Weft connects to the other people who opened the same invitation link. The contents of the module go from device to device (WebRTC); only if you enter a TURN server in the settings can they go through that. The people taking part see the changes to the module and the name and picture you chose for it.",
        "So that the devices can find each other, Weft uses public helper services for live collaboration unless you enter others: Nostr relays through which the devices arrange to meet (only encrypted connection details are stored there, no contents of the module), and public STUN servers from Google and Cloudflare, where a device learns at which address it can be reached on the internet. These services see your device's IP address. You can replace the relays with your own in the settings. Without live collaboration, Weft connects to none of these services.",
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
  supportTitle: "Support",
  supportText: "Support is provided through a Discord server: ask questions, report problems, discuss ideas.",
  supportLink: "Go to the Discord server",
  supportNote: "The link leads to Discord, a third-party service - its terms and privacy policy apply there. Weft itself does not connect to Discord.",
};

/** A link out of the app: in the desktop app through the system (a web view would open it inside itself or not at all). */
function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      onClick={(e) => {
        if (!runsInTauri()) return;
        e.preventDefault();
        void openUrl(href).catch(() => undefined);
      }}
    >
      {children}
    </a>
  );
}

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
          <div>
            <ExternalLink href={`mailto:${EMAIL}`}>{EMAIL}</ExternalLink>
          </div>
        </address>
        <p>{text.legalOutro}</p>
      </section>
      <section>
        <h2>{text.supportTitle}</h2>
        <p>{text.supportText}</p>
        <p>
          <ExternalLink href={DISCORD_URL}>{text.supportLink}</ExternalLink> ({DISCORD_URL})
        </p>
        <p>{text.supportNote}</p>
      </section>
    </article>
  );
}
