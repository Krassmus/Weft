// The words of the two pages of the website (website/privacy.html and website/support.html), in the eight languages of Weft's interface.
// The privacy text is the one of the app's own page ("Datenschutz und Impressum", src/features/start/PrivacyPage.tsx; that one exists in German and
// English only - the other six languages are translations of it, not reviewed by native speakers). If the app's text changes, change it here too.
// Paragraphs may contain HTML (<strong>); {link} and {mail} in the support text become the links.

export const LANGS = ["de", "en", "es", "fr", "pt", "it", "tr", "pl"];
export const NAMES = { de: "Deutsch", en: "English", es: "Español", fr: "Français", pt: "Português", it: "Italiano", tr: "Türkçe", pl: "Polski" };

export const OWNER = { name: "Rasmus Fuhse", street: "Pastor-Sander-Bogen 45", town: "37083 Göttingen", country: "Germany", mail: "krassmus@gmail.com" };
export const DISCORD = "https://discord.gg/y7VnU3psN5";

export const T = {
  de: {
    nav: { privacy: "Datenschutz", support: "Support" },
    privacy: {
      title: "Weft: Datenschutzerklärung",
      sections: [
        { h: "Kurz gesagt", p: ["Weft sammelt <strong>keine Daten</strong> über dich oder darüber, wie du Weft benutzt. Es gibt kein Konto, keine Anmeldung, keine Statistik, keine Telemetrie und keine Absturzberichte. Weft setzt keine Cookies, bindet keine Werbung und keine Skripte von Drittanbietern ein."] },
        { h: "Wo deine Lernmodule liegen", p: ["Deine Lernmodule sind Dateien auf deinem Gerät, in dem Ordner, den du beim Speichern wählst (auf dem iPad im Ordner „Weft“ der Dateien-App). Weft schickt sie nirgendwohin. Was du in Weft erstellst, bleibt bei dir, bis du es selbst weitergibst."] },
        { h: "Was auf deinem Gerät gemerkt wird", p: ["Damit Weft sich beim nächsten Start so zeigt, wie du es verlassen hast, merkt es sich ein paar Dinge im lokalen Speicher der App: die Sprache, die Liste der zuletzt geöffneten Dateien, deine Netzwerk-Einstellungen, den Namen und das Bild, mit denen du in der Zusammenarbeit erscheinst, und eine Wiederherstellungskopie eines Moduls, das noch nicht gespeichert ist. Diese Angaben verlassen dein Gerät nicht. Du entfernst sie, indem du die Daten der App löschst."] },
        { h: "Wann Weft das Netz benutzt", p: [
          "Nur wenn du es willst: Bei der Live-Zusammenarbeit verbindet sich Weft mit den anderen Personen, die denselben Einladungslink geöffnet haben. Die Inhalte des Moduls gehen dabei von Gerät zu Gerät (WebRTC); nur wenn du in den Einstellungen einen TURN-Server einträgst, können sie über diesen laufen. Dabei sehen die Beteiligten die Änderungen am Modul sowie den Namen und das Bild, die du dafür gewählt hast.",
          "Damit die Geräte sich finden, nutzt Weft für die Live-Zusammenarbeit öffentliche Hilfsdienste, solange du nichts anderes einträgst: Nostr-Relays, über die sich die Geräte verabreden (dort liegen nur verschlüsselte Verbindungsangaben, keine Modulinhalte), und öffentliche STUN-Server von Google und Cloudflare, bei denen ein Gerät erfährt, unter welcher Adresse es im Internet erreichbar ist. Diese Dienste sehen die IP-Adresse deines Geräts. Die Relays kannst du in den Einstellungen durch eigene ersetzen. Ohne Live-Zusammenarbeit verbindet sich Weft mit keinem dieser Dienste.",
          "Die Synchronisation über einen gemeinsamen Ordner (zum Beispiel in einer Nextcloud) übernimmt das Betriebssystem bzw. dessen Synchronisations-Programm; Weft selbst schreibt dort nur Dateien.",
        ] },
        { h: "Lernmodule, die du weitergibst", p: ["Ein exportiertes Lernmodul ist eine eigene Webseite. Sie enthält nur, was du hineingelegt hast. Bettest du Inhalte von Dritten ein (zum Beispiel ein Video oder eine Webseite in einem Rahmen), lädt das Modul sie von dort – dafür gelten die Datenschutzbestimmungen dieser Anbieter, und du solltest die Lernenden darauf hinweisen. Wird das Modul in ein Lernmanagementsystem eingebunden, kann es Lernstände (zum Beispiel Punkte) an dieses melden; ohne ein solches System geschieht nichts."] },
      ],
      contactH: "Kontakt und Impressum",
      contactIntro: "Verantwortlich für Weft:",
      contactOutro: "Fragen zum Datenschutz richtest du an dieselbe Adresse.",
      page: "Diese Webseite setzt keine Cookies, nutzt keine Analyse-Werkzeuge und lädt nichts von anderen Seiten.",
    },
    support: {
      title: "Weft: Support",
      intro: "Fragen, Ideen, Fehlermeldungen? Sehr gern! Es gibt zwei Wege, uns zu erreichen.",
      discordH: "Discord",
      discordText: "Am besten kommst du auf unseren Discord-Server: Fragen stellen, Fehler melden, Ideen besprechen und sehen, was andere mit Weft bauen: {link}",
      discordNote: "Der Link führt zu Discord, einem Dienst eines Drittanbieters – dort gelten dessen Nutzungs- und Datenschutzbestimmungen.",
      emailH: "E-Mail",
      emailText: "Falls Discord keine Option für dich ist, schreib uns an {mail}.",
      bugsH: "Tipps für Fehlermeldungen",
      bugsText: "Hilfreich ist: was du gemacht hast, was du erwartet hast und was stattdessen passiert ist, auf welchem Gerät (Mac oder iPad) und in welcher Version von Weft.",
      startH: "Der Einstieg",
      startText: "Auf dem Startbildschirm von Weft gibt es kurze Tutorials („Weft kennenlernen“), die Schritt für Schritt zeigen, wie man ein Lernmodul baut.",
    },
  },

  en: {
    nav: { privacy: "Privacy", support: "Support" },
    privacy: {
      title: "Weft: Privacy Policy",
      sections: [
        { h: "In short", p: ["Weft collects <strong>no data</strong> about you or about how you use Weft. There is no account, no sign-in, no statistics, no telemetry and no crash reports. Weft sets no cookies and includes no advertising and no third-party scripts."] },
        { h: "Where your learning modules are", p: ["Your learning modules are files on your device, in the folder you choose when you save (on the iPad: the “Weft” folder in the Files app). Weft sends them nowhere. What you create in Weft stays with you until you hand it on yourself."] },
        { h: "What is remembered on your device", p: ["So that Weft looks the next time the way you left it, it remembers a few things in the app’s local storage: the language, the list of recently opened files, your network settings, the name and picture you appear with when working together, and a recovery copy of a module that has not been saved yet. None of this leaves your device. You remove it by deleting the app’s data."] },
        { h: "When Weft uses the network", p: [
          "Only when you want it to: with live collaboration, Weft connects to the other people who opened the same invitation link. The contents of the module go from device to device (WebRTC); only if you enter a TURN server in the settings can they go through that. The people taking part see the changes to the module and the name and picture you chose for it.",
          "So that the devices can find each other, Weft uses public helper services for live collaboration unless you enter others: Nostr relays through which the devices arrange to meet (only encrypted connection details are stored there, no contents of the module), and public STUN servers from Google and Cloudflare, where a device learns at which address it can be reached on the internet. These services see your device’s IP address. You can replace the relays with your own in the settings. Without live collaboration, Weft connects to none of these services.",
          "Synchronization through a shared folder (in a Nextcloud, for example) is done by the operating system or its sync program; Weft itself only writes files there.",
        ] },
        { h: "Learning modules you hand on", p: ["An exported learning module is a web page of its own. It contains only what you put into it. If you embed content from third parties (a video or a web page in a frame, for example), the module loads it from there – the privacy policies of those providers apply, and you should tell your learners. If the module is embedded in a learning management system, it can report progress (points, for example) to it; without such a system nothing happens."] },
      ],
      contactH: "Contact and legal notice",
      contactIntro: "Responsible for Weft:",
      contactOutro: "Questions about privacy go to the same address.",
      page: "This web page sets no cookies, uses no analytics and loads nothing from other sites.",
    },
    support: {
      title: "Weft: Support",
      intro: "Questions, ideas, bug reports? Great! There are two ways to reach us.",
      discordH: "Discord",
      discordText: "The best place is our Discord server: ask questions, report problems, discuss ideas and see what others are building with Weft: {link}",
      discordNote: "The link leads to Discord, a third-party service – its terms and privacy policy apply there.",
      emailH: "Email",
      emailText: "If Discord is not an option for you, write to us at {mail}.",
      bugsH: "Tips for bug reports",
      bugsText: "Helpful: what you did, what you expected, what happened instead, on which device (Mac or iPad) and in which version of Weft.",
      startH: "Getting started",
      startText: "On the start screen of Weft you will find short tutorials (“Get to know Weft”) that show step by step how to build a learning module.",
    },
  },

  es: {
    nav: { privacy: "Privacidad", support: "Soporte" },
    privacy: {
      title: "Weft: Política de privacidad",
      sections: [
        { h: "En resumen", p: ["Weft no recoge <strong>ningún dato</strong> sobre ti ni sobre cómo usas Weft. No hay cuenta, ni inicio de sesión, ni estadísticas, ni telemetría, ni informes de fallos. Weft no usa cookies y no incluye publicidad ni scripts de terceros."] },
        { h: "Dónde están tus módulos de aprendizaje", p: ["Tus módulos de aprendizaje son archivos en tu dispositivo, en la carpeta que eliges al guardar (en el iPad: la carpeta «Weft» de la app Archivos). Weft no los envía a ningún sitio. Lo que creas en Weft se queda contigo hasta que decidas compartirlo."] },
        { h: "Qué se recuerda en tu dispositivo", p: ["Para que Weft se muestre en el próximo inicio tal como lo dejaste, recuerda algunas cosas en el almacenamiento local de la app: el idioma, la lista de archivos abiertos recientemente, tus ajustes de red, el nombre y la imagen con los que apareces en la colaboración y una copia de recuperación de un módulo que aún no se ha guardado. Nada de esto sale de tu dispositivo. Para eliminarlo, borra los datos de la app."] },
        { h: "Cuándo usa Weft la red", p: [
          "Solo cuando tú quieres: en la colaboración en vivo, Weft se conecta con las demás personas que han abierto el mismo enlace de invitación. El contenido del módulo va de dispositivo a dispositivo (WebRTC); solo si introduces un servidor TURN en los ajustes puede pasar por él. Las personas que participan ven los cambios en el módulo, así como el nombre y la imagen que has elegido para ello.",
          "Para que los dispositivos se encuentren, Weft usa en la colaboración en vivo servicios auxiliares públicos mientras no indiques otros: relés Nostr, a través de los cuales los dispositivos quedan para conectarse (allí solo hay datos de conexión cifrados, ningún contenido del módulo), y servidores STUN públicos de Google y Cloudflare, con los que un dispositivo averigua en qué dirección es accesible en internet. Estos servicios ven la dirección IP de tu dispositivo. Puedes sustituir los relés por otros propios en los ajustes. Sin colaboración en vivo, Weft no se conecta con ninguno de estos servicios.",
          "La sincronización mediante una carpeta compartida (por ejemplo, en una Nextcloud) la realiza el sistema operativo o su programa de sincronización; Weft solo escribe archivos allí.",
        ] },
        { h: "Módulos de aprendizaje que compartes", p: ["Un módulo de aprendizaje exportado es una página web propia. Contiene solo lo que has puesto en él. Si incrustas contenido de terceros (por ejemplo, un vídeo o una página web en un marco), el módulo lo carga desde allí: se aplican las políticas de privacidad de esos proveedores y deberías informar a quienes aprenden. Si el módulo se integra en un sistema de gestión del aprendizaje, puede comunicarle avances (por ejemplo, puntos); sin ese sistema no ocurre nada."] },
      ],
      contactH: "Contacto y aviso legal",
      contactIntro: "Responsable de Weft:",
      contactOutro: "Las preguntas sobre privacidad se dirigen a la misma dirección.",
      page: "Esta página web no usa cookies ni análisis y no carga nada de otros sitios.",
    },
    support: {
      title: "Weft: Soporte",
      intro: "¿Preguntas, ideas, informes de errores? ¡Estupendo! Hay dos formas de contactarnos.",
      discordH: "Discord",
      discordText: "Lo mejor es nuestro servidor de Discord: haz preguntas, informa de problemas, comenta ideas y mira qué construyen otras personas con Weft: {link}",
      discordNote: "El enlace lleva a Discord, un servicio de un tercero: allí se aplican sus condiciones de uso y su política de privacidad.",
      emailH: "Correo electrónico",
      emailText: "Si Discord no es una opción para ti, escríbenos a {mail}.",
      bugsH: "Consejos para informar de errores",
      bugsText: "Ayuda saber: qué hiciste, qué esperabas y qué ocurrió en su lugar, en qué dispositivo (Mac o iPad) y con qué versión de Weft.",
      startH: "Primeros pasos",
      startText: "En la pantalla de inicio de Weft hay tutoriales breves («Conoce Weft») que muestran paso a paso cómo crear un módulo de aprendizaje.",
    },
  },

  fr: {
    nav: { privacy: "Confidentialité", support: "Assistance" },
    privacy: {
      title: "Weft : Politique de confidentialité",
      sections: [
        { h: "En bref", p: ["Weft ne collecte <strong>aucune donnée</strong> sur toi ni sur la façon dont tu utilises Weft. Il n’y a ni compte, ni connexion, ni statistiques, ni télémétrie, ni rapports de plantage. Weft ne dépose aucun cookie et n’intègre ni publicité ni script de tiers."] },
        { h: "Où se trouvent tes modules d’apprentissage", p: ["Tes modules d’apprentissage sont des fichiers sur ton appareil, dans le dossier que tu choisis à l’enregistrement (sur l’iPad : le dossier « Weft » de l’app Fichiers). Weft ne les envoie nulle part. Ce que tu crées dans Weft reste chez toi jusqu’à ce que tu le transmettes toi-même."] },
        { h: "Ce qui est mémorisé sur ton appareil", p: ["Pour que Weft apparaisse au prochain démarrage comme tu l’as laissé, il mémorise quelques éléments dans le stockage local de l’app : la langue, la liste des fichiers ouverts récemment, tes réglages réseau, le nom et l’image sous lesquels tu apparais lors de la collaboration, et une copie de récupération d’un module qui n’est pas encore enregistré. Rien de tout cela ne quitte ton appareil. Pour l’effacer, supprime les données de l’app."] },
        { h: "Quand Weft utilise le réseau", p: [
          "Seulement quand tu le veux : lors de la collaboration en direct, Weft se connecte aux autres personnes qui ont ouvert le même lien d’invitation. Le contenu du module passe d’un appareil à l’autre (WebRTC) ; il ne peut passer par un serveur TURN que si tu en indiques un dans les réglages. Les personnes qui participent voient les modifications du module ainsi que le nom et l’image que tu as choisis pour cela.",
          "Pour que les appareils se trouvent, Weft utilise pour la collaboration en direct des services auxiliaires publics, tant que tu n’en indiques pas d’autres : des relais Nostr, par lesquels les appareils se donnent rendez-vous (on n’y trouve que des informations de connexion chiffrées, aucun contenu du module), et des serveurs STUN publics de Google et de Cloudflare, auprès desquels un appareil apprend à quelle adresse il est joignable sur Internet. Ces services voient l’adresse IP de ton appareil. Tu peux remplacer les relais par les tiens dans les réglages. Sans collaboration en direct, Weft ne se connecte à aucun de ces services.",
          "La synchronisation via un dossier partagé (par exemple dans un Nextcloud) est assurée par le système d’exploitation ou son programme de synchronisation ; Weft se contente d’y écrire des fichiers.",
        ] },
        { h: "Les modules d’apprentissage que tu transmets", p: ["Un module d’apprentissage exporté est une page web à part entière. Elle ne contient que ce que tu y as mis. Si tu intègres des contenus de tiers (par exemple une vidéo ou une page web dans un cadre), le module les charge depuis leur source : les règles de confidentialité de ces fournisseurs s’appliquent, et tu devrais en informer les apprenants. Si le module est intégré à un système de gestion de l’apprentissage, il peut lui transmettre des résultats (par exemple des points) ; sans un tel système, il ne se passe rien."] },
      ],
      contactH: "Contact et mentions légales",
      contactIntro: "Responsable de Weft :",
      contactOutro: "Les questions sur la confidentialité sont à adresser à la même adresse.",
      page: "Cette page web ne dépose aucun cookie, n’utilise aucun outil d’analyse et ne charge rien depuis d’autres sites.",
    },
    support: {
      title: "Weft : Assistance",
      intro: "Des questions, des idées, des signalements de bugs ? Très bien ! Il y a deux façons de nous joindre.",
      discordH: "Discord",
      discordText: "Le mieux est de passer par notre serveur Discord : poser des questions, signaler des problèmes, discuter d’idées et voir ce que d’autres créent avec Weft : {link}",
      discordNote: "Le lien mène à Discord, un service tiers : ses conditions d’utilisation et sa politique de confidentialité s’y appliquent.",
      emailH: "E-mail",
      emailText: "Si Discord n’est pas une option pour toi, écris-nous à {mail}.",
      bugsH: "Conseils pour signaler un problème",
      bugsText: "Il est utile d’indiquer : ce que tu as fait, ce que tu attendais et ce qui s’est passé à la place, sur quel appareil (Mac ou iPad) et avec quelle version de Weft.",
      startH: "Pour bien démarrer",
      startText: "Sur l’écran d’accueil de Weft, de courts tutoriels (« Découvrir Weft ») montrent pas à pas comment créer un module d’apprentissage.",
    },
  },

  pt: {
    nav: { privacy: "Privacidade", support: "Suporte" },
    privacy: {
      title: "Weft: Política de privacidade",
      sections: [
        { h: "Em resumo", p: ["O Weft não coleta <strong>nenhum dado</strong> sobre você nem sobre como você usa o Weft. Não há conta, login, estatísticas, telemetria nem relatórios de falhas. O Weft não define cookies e não inclui publicidade nem scripts de terceiros."] },
        { h: "Onde ficam seus módulos de aprendizagem", p: ["Seus módulos de aprendizagem são arquivos no seu dispositivo, na pasta que você escolhe ao salvar (no iPad: a pasta “Weft” no app Arquivos). O Weft não os envia a lugar nenhum. O que você cria no Weft fica com você até que você mesmo o compartilhe."] },
        { h: "O que é lembrado no seu dispositivo", p: ["Para que o Weft apareça na próxima vez como você o deixou, ele lembra algumas coisas no armazenamento local do app: o idioma, a lista de arquivos abertos recentemente, suas configurações de rede, o nome e a imagem com que você aparece na colaboração e uma cópia de recuperação de um módulo que ainda não foi salvo. Nada disso sai do seu dispositivo. Para removê-lo, apague os dados do app."] },
        { h: "Quando o Weft usa a rede", p: [
          "Somente quando você quiser: na colaboração ao vivo, o Weft se conecta às outras pessoas que abriram o mesmo link de convite. O conteúdo do módulo vai de dispositivo para dispositivo (WebRTC); só passa por um servidor TURN se você informar um nas configurações. As pessoas participantes veem as alterações no módulo, bem como o nome e a imagem que você escolheu para isso.",
          "Para que os dispositivos se encontrem, o Weft usa na colaboração ao vivo serviços auxiliares públicos, enquanto você não informar outros: relays Nostr, pelos quais os dispositivos combinam o encontro (lá ficam apenas dados de conexão criptografados, nenhum conteúdo do módulo), e servidores STUN públicos do Google e da Cloudflare, nos quais um dispositivo descobre em que endereço pode ser alcançado na internet. Esses serviços veem o endereço IP do seu dispositivo. Nas configurações, você pode substituir os relays pelos seus próprios. Sem colaboração ao vivo, o Weft não se conecta a nenhum desses serviços.",
          "A sincronização por uma pasta compartilhada (por exemplo, em um Nextcloud) é feita pelo sistema operacional ou pelo programa de sincronização dele; o próprio Weft apenas grava arquivos lá.",
        ] },
        { h: "Módulos de aprendizagem que você repassa", p: ["Um módulo de aprendizagem exportado é uma página web própria. Ele contém apenas o que você colocou nele. Se você incorporar conteúdo de terceiros (por exemplo, um vídeo ou uma página web em um quadro), o módulo o carrega de lá: valem as políticas de privacidade desses provedores, e você deve avisar quem aprende. Se o módulo for integrado a um sistema de gestão de aprendizagem, ele pode informar a esse sistema o progresso (por exemplo, pontos); sem esse sistema, nada acontece."] },
      ],
      contactH: "Contato e aviso legal",
      contactIntro: "Responsável pelo Weft:",
      contactOutro: "Dúvidas sobre privacidade devem ser enviadas para o mesmo endereço.",
      page: "Esta página web não define cookies, não usa análises e não carrega nada de outros sites.",
    },
    support: {
      title: "Weft: Suporte",
      intro: "Dúvidas, ideias, relatos de erros? Ótimo! Há duas formas de falar com a gente.",
      discordH: "Discord",
      discordText: "O melhor é o nosso servidor do Discord: faça perguntas, relate problemas, converse sobre ideias e veja o que outras pessoas estão criando com o Weft: {link}",
      discordNote: "O link leva ao Discord, um serviço de terceiros: lá valem os termos de uso e a política de privacidade dele.",
      emailH: "E-mail",
      emailText: "Se o Discord não for uma opção para você, escreva para {mail}.",
      bugsH: "Dicas para relatar erros",
      bugsText: "Ajuda saber: o que você fez, o que esperava e o que aconteceu em vez disso, em qual dispositivo (Mac ou iPad) e em qual versão do Weft.",
      startH: "Primeiros passos",
      startText: "Na tela inicial do Weft há tutoriais curtos (“Conheça o Weft”) que mostram passo a passo como criar um módulo de aprendizagem.",
    },
  },

  it: {
    nav: { privacy: "Privacy", support: "Assistenza" },
    privacy: {
      title: "Weft: Informativa sulla privacy",
      sections: [
        { h: "In breve", p: ["Weft non raccoglie <strong>nessun dato</strong> su di te né su come usi Weft. Non esistono account, accessi, statistiche, telemetria né rapporti sugli arresti anomali. Weft non imposta cookie e non include pubblicità né script di terze parti."] },
        { h: "Dove si trovano i tuoi moduli di apprendimento", p: ["I tuoi moduli di apprendimento sono file sul tuo dispositivo, nella cartella che scegli al momento del salvataggio (su iPad: la cartella «Weft» nell’app File). Weft non li invia da nessuna parte. Ciò che crei in Weft resta con te finché non lo condividi tu stesso."] },
        { h: "Cosa viene ricordato sul tuo dispositivo", p: ["Perché al prossimo avvio Weft si presenti come l’hai lasciato, ricorda alcune cose nella memoria locale dell’app: la lingua, l’elenco dei file aperti di recente, le tue impostazioni di rete, il nome e l’immagine con cui compari nella collaborazione e una copia di ripristino di un modulo non ancora salvato. Nulla di tutto ciò lascia il tuo dispositivo. Per rimuoverlo, elimina i dati dell’app."] },
        { h: "Quando Weft usa la rete", p: [
          "Solo quando lo vuoi tu: nella collaborazione dal vivo, Weft si collega alle altre persone che hanno aperto lo stesso link d’invito. I contenuti del modulo vanno da dispositivo a dispositivo (WebRTC); passano da un server TURN solo se ne inserisci uno nelle impostazioni. Chi partecipa vede le modifiche al modulo, il nome e l’immagine che hai scelto a tale scopo.",
          "Perché i dispositivi si trovino, per la collaborazione dal vivo Weft usa servizi di supporto pubblici, finché non ne indichi altri: relay Nostr, tramite i quali i dispositivi si accordano (vi sono memorizzati solo dati di connessione cifrati, nessun contenuto del modulo), e server STUN pubblici di Google e Cloudflare, presso i quali un dispositivo scopre a quale indirizzo è raggiungibile in internet. Questi servizi vedono l’indirizzo IP del tuo dispositivo. Nelle impostazioni puoi sostituire i relay con i tuoi. Senza collaborazione dal vivo, Weft non si collega a nessuno di questi servizi.",
          "La sincronizzazione tramite una cartella condivisa (per esempio in una Nextcloud) è gestita dal sistema operativo o dal suo programma di sincronizzazione; Weft stesso vi scrive soltanto file.",
        ] },
        { h: "Moduli di apprendimento che condividi", p: ["Un modulo di apprendimento esportato è una pagina web a sé. Contiene solo ciò che vi hai inserito. Se incorpori contenuti di terzi (per esempio un video o una pagina web in un riquadro), il modulo li carica da lì: valgono le informative sulla privacy di quei fornitori e dovresti avvisare chi apprende. Se il modulo è integrato in un sistema di gestione dell’apprendimento, può comunicargli i progressi (per esempio i punti); senza un tale sistema non succede nulla."] },
      ],
      contactH: "Contatti e note legali",
      contactIntro: "Responsabile di Weft:",
      contactOutro: "Le domande sulla privacy vanno allo stesso indirizzo.",
      page: "Questa pagina web non imposta cookie, non usa strumenti di analisi e non carica nulla da altri siti.",
    },
    support: {
      title: "Weft: Assistenza",
      intro: "Domande, idee, segnalazioni di errori? Benissimo! Ci sono due modi per contattarci.",
      discordH: "Discord",
      discordText: "La cosa migliore è il nostro server Discord: fai domande, segnala problemi, discuti idee e guarda cosa costruiscono gli altri con Weft: {link}",
      discordNote: "Il link porta a Discord, un servizio di terze parti: lì valgono le sue condizioni d’uso e la sua informativa sulla privacy.",
      emailH: "E-mail",
      emailText: "Se Discord non è un’opzione per te, scrivici a {mail}.",
      bugsH: "Consigli per segnalare un errore",
      bugsText: "È utile sapere: cosa hai fatto, cosa ti aspettavi e cosa è successo invece, su quale dispositivo (Mac o iPad) e con quale versione di Weft.",
      startH: "Per iniziare",
      startText: "Nella schermata iniziale di Weft trovi brevi tutorial («Conosci Weft») che mostrano passo dopo passo come creare un modulo di apprendimento.",
    },
  },

  tr: {
    nav: { privacy: "Gizlilik", support: "Destek" },
    privacy: {
      title: "Weft: Gizlilik Politikası",
      sections: [
        { h: "Kısaca", p: ["Weft, senin hakkında ve Weft’i nasıl kullandığın hakkında <strong>hiçbir veri toplamaz</strong>. Hesap, oturum açma, istatistik, telemetri ve çökme raporu yoktur. Weft çerez kullanmaz; reklam ve üçüncü taraf betikleri içermez."] },
        { h: "Öğrenme modüllerin nerede duruyor", p: ["Öğrenme modüllerin, cihazındaki dosyalardır; kaydederken seçtiğin klasörde bulunur (iPad’de: Dosyalar uygulamasındaki “Weft” klasörü). Weft bunları hiçbir yere göndermez. Weft’te oluşturduklarının, sen kendin paylaşana kadar sende kalır."] },
        { h: "Cihazında neler hatırlanır", p: ["Weft’in bir sonraki açılışta bıraktığın gibi görünmesi için uygulamanın yerel depolama alanında birkaç şey saklanır: dil, son açılan dosyaların listesi, ağ ayarların, birlikte çalışırken görünen adın ve resmin ve henüz kaydedilmemiş bir modülün kurtarma kopyası. Bunların hiçbiri cihazından çıkmaz. Silmek için uygulamanın verilerini sil."] },
        { h: "Weft ağı ne zaman kullanır", p: [
          "Yalnızca sen istediğinde: canlı iş birliğinde Weft, aynı davet bağlantısını açan diğer kişilerle bağlantı kurar. Modülün içeriği cihazdan cihaza gider (WebRTC); ancak ayarlarda bir TURN sunucusu girersen o sunucu üzerinden geçebilir. Katılanlar, modülde yapılan değişiklikleri ve bunun için seçtiğin adı ve resmi görür.",
          "Cihazların birbirini bulabilmesi için Weft, sen başka hizmetler girmediğin sürece canlı iş birliğinde herkese açık yardımcı hizmetler kullanır: cihazların buluşmayı ayarladığı Nostr röleleri (orada yalnızca şifrelenmiş bağlantı bilgileri bulunur, modülün içeriği yoktur) ve bir cihazın internette hangi adresten erişilebildiğini öğrendiği Google ve Cloudflare’ın herkese açık STUN sunucuları. Bu hizmetler cihazının IP adresini görür. Röleleri ayarlardan kendi rölelerinle değiştirebilirsin. Canlı iş birliği olmadan Weft bu hizmetlerin hiçbirine bağlanmaz.",
          "Ortak bir klasör üzerinden eşitleme (örneğin bir Nextcloud’da) işletim sistemi ya da onun eşitleme programı tarafından yapılır; Weft oraya yalnızca dosya yazar.",
        ] },
        { h: "Paylaştığın öğrenme modülleri", p: ["Dışa aktarılan bir öğrenme modülü, başlı başına bir web sayfasıdır. İçinde yalnızca senin koydukların bulunur. Üçüncü tarafların içeriklerini (örneğin bir çerçeve içinde video ya da web sayfası) gömersen modül bunları oradan yükler; bu sağlayıcıların gizlilik politikaları geçerlidir ve öğrenenleri bu konuda bilgilendirmelisin. Modül bir öğrenme yönetim sistemine gömülürse ilerlemeyi (örneğin puanları) ona bildirebilir; böyle bir sistem yoksa hiçbir şey olmaz."] },
      ],
      contactH: "İletişim ve yasal bilgiler",
      contactIntro: "Weft’ten sorumlu:",
      contactOutro: "Gizlilikle ilgili sorular aynı adrese gönderilir.",
      page: "Bu web sayfası çerez kullanmaz, analiz aracı kullanmaz ve başka sitelerden hiçbir şey yüklemez.",
    },
    support: {
      title: "Weft: Destek",
      intro: "Sorular, fikirler, hata bildirimleri mi? Harika! Bize ulaşmanın iki yolu var.",
      discordH: "Discord",
      discordText: "En iyisi Discord sunucumuz: soru sor, sorunları bildir, fikirleri tartış ve başkalarının Weft ile neler yaptığını gör: {link}",
      discordNote: "Bağlantı, üçüncü taraf bir hizmet olan Discord’a gider; orada onun kullanım koşulları ve gizlilik politikası geçerlidir.",
      emailH: "E-posta",
      emailText: "Discord senin için bir seçenek değilse bize {mail} adresinden yaz.",
      bugsH: "Hata bildirimi için ipuçları",
      bugsText: "Şunları bilmek yardımcı olur: ne yaptığın, ne beklediğin ve bunun yerine ne olduğu, hangi cihazda (Mac ya da iPad) ve Weft’in hangi sürümünde.",
      startH: "Başlarken",
      startText: "Weft’in başlangıç ekranında, bir öğrenme modülünün adım adım nasıl oluşturulduğunu gösteren kısa eğitimler (“Weft’i tanı”) bulunur.",
    },
  },

  pl: {
    nav: { privacy: "Prywatność", support: "Pomoc" },
    privacy: {
      title: "Weft: Polityka prywatności",
      sections: [
        { h: "W skrócie", p: ["Weft nie zbiera <strong>żadnych danych</strong> o tobie ani o tym, jak korzystasz z Weft. Nie ma konta, logowania, statystyk, telemetrii ani raportów o awariach. Weft nie ustawia plików cookie i nie zawiera reklam ani skryptów stron trzecich."] },
        { h: "Gdzie są twoje moduły edukacyjne", p: ["Twoje moduły edukacyjne to pliki na twoim urządzeniu, w folderze, który wybierasz przy zapisie (na iPadzie: folder „Weft” w aplikacji Pliki). Weft nie wysyła ich nigdzie. To, co tworzysz w Weft, zostaje u ciebie, dopóki go nie udostępnisz."] },
        { h: "Co jest zapamiętywane na twoim urządzeniu", p: ["Aby Weft przy następnym uruchomieniu wyglądał tak samo jak przy zamknięciu, w lokalnej pamięci aplikacji zapisanych jest kilka rzeczy: język, lista ostatnio otwartych plików, twoje ustawienia sieci, nazwa i obraz, z którymi występujesz we współpracy, oraz kopia odzyskiwania modułu, który nie został jeszcze zapisany. Nic z tego nie opuszcza twojego urządzenia. Aby to usunąć, skasuj dane aplikacji."] },
        { h: "Kiedy Weft korzysta z sieci", p: [
          "Tylko wtedy, gdy tego chcesz: przy współpracy na żywo Weft łączy się z innymi osobami, które otworzyły ten sam link z zaproszeniem. Zawartość modułu przechodzi z urządzenia na urządzenie (WebRTC); przez serwer TURN może przejść tylko wtedy, gdy wpiszesz go w ustawieniach. Uczestnicy widzą zmiany w module oraz nazwę i obraz wybrane do tego celu.",
          "Aby urządzenia mogły się odnaleźć, Weft używa przy współpracy na żywo publicznych usług pomocniczych, dopóki nie wpiszesz innych: przekaźników Nostr, za pomocą których urządzenia umawiają się na połączenie (znajdują się tam tylko zaszyfrowane dane połączenia, żadnej zawartości modułu), oraz publicznych serwerów STUN firm Google i Cloudflare, od których urządzenie dowiaduje się, pod jakim adresem jest osiągalne w internecie. Te usługi widzą adres IP twojego urządzenia. W ustawieniach możesz zastąpić przekaźniki własnymi. Bez współpracy na żywo Weft nie łączy się z żadną z tych usług.",
          "Synchronizację przez wspólny folder (na przykład w Nextcloud) wykonuje system operacyjny lub jego program do synchronizacji; sam Weft zapisuje tam tylko pliki.",
        ] },
        { h: "Moduły edukacyjne, które przekazujesz dalej", p: ["Wyeksportowany moduł edukacyjny to osobna strona internetowa. Zawiera tylko to, co zostało w nim umieszczone. Jeśli osadzisz treści osób trzecich (na przykład film lub stronę internetową w ramce), moduł pobiera je stamtąd – obowiązują wtedy zasady prywatności tych dostawców i należy poinformować o tym uczących się. Jeśli moduł jest osadzony w systemie zarządzania nauczaniem, może przekazywać mu postępy (na przykład punkty); bez takiego systemu nic się nie dzieje."] },
      ],
      contactH: "Kontakt i nota prawna",
      contactIntro: "Odpowiedzialny za Weft:",
      contactOutro: "Pytania dotyczące prywatności należy kierować na ten sam adres.",
      page: "Ta strona internetowa nie ustawia plików cookie, nie używa narzędzi analitycznych i nie ładuje niczego z innych witryn.",
    },
    support: {
      title: "Weft: Pomoc",
      intro: "Pytania, pomysły, zgłoszenia błędów? Świetnie! Są dwa sposoby, żeby się z nami skontaktować.",
      discordH: "Discord",
      discordText: "Najlepiej na naszym serwerze Discord: zadawaj pytania, zgłaszaj problemy, omawiaj pomysły i zobacz, co inni tworzą w Weft: {link}",
      discordNote: "Link prowadzi do Discorda, usługi osoby trzeciej – obowiązują tam jej regulamin i polityka prywatności.",
      emailH: "E-mail",
      emailText: "Jeśli Discord nie wchodzi w grę, napisz do nas na {mail}.",
      bugsH: "Wskazówki do zgłaszania błędów",
      bugsText: "Pomocne są informacje: jakie czynności doprowadziły do błędu, czego oczekiwano i co stało się zamiast tego, na jakim urządzeniu (Mac lub iPad) i w jakiej wersji Weft.",
      startH: "Na początek",
      startText: "Na ekranie startowym Weft znajdziesz krótkie samouczki („Poznaj Weft”), które krok po kroku pokazują, jak zbudować moduł edukacyjny.",
    },
  },
};
