import { useResolvedLanguage } from "../src/core/i18n/languageStore";
import type { Language } from "../src/core/i18n/translations";

/**
 * The few words of the app "Weft Player" (the interface of the editor has its own, much bigger table in src/core/i18n). In the eight languages of Weft,
 * in the language of the phone. {name} is replaced.
 */
interface Strings {
  /** Heading of the modules that were opened on this phone. */
  mine: string;
  /** Heading of the modules that come with the app. */
  examples: string;
  /** Nothing there yet. */
  empty: string;
  opening: string;
  /** The cross in the corner above the module (back to the start page). */
  close: string;
  remove: string;
  removeAsk: string;
  cancel: string;
  ok: string;
  /** A module could not be read or played. */
  cannotOpen: string;
  /** A file that was handed over is no Weft file (or damaged). */
  cannotOpenFile: string;
  inviteTitle: string;
  inviteText: string;
  rotate: string;
}

const STRINGS: Record<Language, Strings> = {
  de: {
    mine: "Meine Module",
    examples: "Beispiele",
    empty: "Noch keine Module. Schickt dir jemand ein Weft-Modul, zum Beispiel per Mail oder Messenger, öffne die Datei hier: Sie wird auf diesem Gerät abgelegt und sofort abgespielt.",
    opening: "Wird geöffnet …",
    close: "Schließen",
    remove: "Entfernen",
    removeAsk: "Dieses Modul von diesem Gerät entfernen?",
    cancel: "Abbrechen",
    ok: "OK",
    cannotOpen: "Dieses Modul lässt sich nicht öffnen.",
    cannotOpenFile: "Diese Datei lässt sich nicht öffnen. Ist es eine Weft-Datei?",
    inviteTitle: "Link zum gemeinsamen Bearbeiten",
    inviteText: "Das ist ein Link, mit dem man ein Modul gemeinsam bearbeitet. Er lässt sich nur in Weft auf einem Tablet oder Computer öffnen, nicht hier: Dieser Player spielt Module nur ab.",
    rotate: "Tipp: Drehe das Telefon ins Querformat.",
  },
  en: {
    mine: "My modules",
    examples: "Examples",
    empty: "No modules yet. If somebody sends you a Weft module, by mail or a messenger for example, open the file here: it is kept on this device and played right away.",
    opening: "Opening …",
    close: "Close",
    remove: "Remove",
    removeAsk: "Remove this module from this device?",
    cancel: "Cancel",
    ok: "OK",
    cannotOpen: "This module can't be opened.",
    cannotOpenFile: "This file can't be opened. Is it a Weft file?",
    inviteTitle: "Link for working together",
    inviteText: "This is a link for editing a module together. It can only be opened in Weft on a tablet or a computer, not here: this player only plays modules.",
    rotate: "Tip: turn your phone sideways.",
  },
  es: {
    mine: "Mis módulos",
    examples: "Ejemplos",
    empty: "Aún no hay módulos. Si alguien te envía un módulo de Weft, por correo o por mensajería, por ejemplo, abre el archivo aquí: se guardará en este dispositivo y se reproducirá enseguida.",
    opening: "Abriendo …",
    close: "Cerrar",
    remove: "Quitar",
    removeAsk: "¿Quitar este módulo de este dispositivo?",
    cancel: "Cancelar",
    ok: "OK",
    cannotOpen: "No se puede abrir este módulo.",
    cannotOpenFile: "No se puede abrir este archivo. ¿Es un archivo de Weft?",
    inviteTitle: "Enlace para trabajar juntos",
    inviteText: "Este es un enlace para editar un módulo en conjunto. Solo se puede abrir en Weft en una tableta o un ordenador, no aquí: este reproductor solo reproduce módulos.",
    rotate: "Consejo: gira el teléfono en horizontal.",
  },
  fr: {
    mine: "Mes modules",
    examples: "Exemples",
    empty: "Aucun module pour l’instant. Si quelqu’un t’envoie un module Weft, par e-mail ou par messagerie par exemple, ouvre le fichier ici : il est conservé sur cet appareil et lu aussitôt.",
    opening: "Ouverture …",
    close: "Fermer",
    remove: "Retirer",
    removeAsk: "Retirer ce module de cet appareil ?",
    cancel: "Annuler",
    ok: "OK",
    cannotOpen: "Ce module ne peut pas être ouvert.",
    cannotOpenFile: "Ce fichier ne peut pas être ouvert. Est-ce un fichier Weft ?",
    inviteTitle: "Lien pour travailler ensemble",
    inviteText: "Ceci est un lien pour modifier un module à plusieurs. Il ne s’ouvre que dans Weft sur une tablette ou un ordinateur, pas ici : ce lecteur ne fait que lire les modules.",
    rotate: "Astuce : tourne le téléphone en mode paysage.",
  },
  pt: {
    mine: "Meus módulos",
    examples: "Exemplos",
    empty: "Ainda não há módulos. Se alguém lhe enviar um módulo do Weft, por e-mail ou mensageiro, por exemplo, abra o arquivo aqui: ele fica guardado neste dispositivo e é reproduzido na hora.",
    opening: "Abrindo …",
    close: "Fechar",
    remove: "Remover",
    removeAsk: "Remover este módulo deste dispositivo?",
    cancel: "Cancelar",
    ok: "OK",
    cannotOpen: "Não foi possível abrir este módulo.",
    cannotOpenFile: "Não foi possível abrir este arquivo. É um arquivo do Weft?",
    inviteTitle: "Link para trabalhar em conjunto",
    inviteText: "Este é um link para editar um módulo em conjunto. Ele só pode ser aberto no Weft em um tablet ou computador, não aqui: este player apenas reproduz módulos.",
    rotate: "Dica: gire o telefone para a horizontal.",
  },
  it: {
    mine: "I miei moduli",
    examples: "Esempi",
    empty: "Ancora nessun modulo. Se qualcuno ti manda un modulo Weft, per esempio per e-mail o con un messenger, apri qui il file: viene salvato su questo dispositivo e riprodotto subito.",
    opening: "Apertura …",
    close: "Chiudi",
    remove: "Rimuovi",
    removeAsk: "Rimuovere questo modulo da questo dispositivo?",
    cancel: "Annulla",
    ok: "OK",
    cannotOpen: "Impossibile aprire questo modulo.",
    cannotOpenFile: "Impossibile aprire questo file. È un file Weft?",
    inviteTitle: "Link per lavorare insieme",
    inviteText: "Questo è un link per modificare un modulo insieme ad altri. Si può aprire solo in Weft su un tablet o un computer, non qui: questo player riproduce soltanto i moduli.",
    rotate: "Suggerimento: ruota il telefono in orizzontale.",
  },
  tr: {
    mine: "Modüllerim",
    examples: "Örnekler",
    empty: "Henüz modül yok. Birisi sana bir Weft modülü gönderirse, örneğin e-postayla ya da bir mesajlaşma uygulamasıyla, dosyayı burada aç: Bu cihaza kaydedilir ve hemen oynatılır.",
    opening: "Açılıyor …",
    close: "Kapat",
    remove: "Kaldır",
    removeAsk: "Bu modül bu cihazdan kaldırılsın mı?",
    cancel: "İptal",
    ok: "Tamam",
    cannotOpen: "Bu modül açılamıyor.",
    cannotOpenFile: "Bu dosya açılamıyor. Bir Weft dosyası mı?",
    inviteTitle: "Birlikte çalışma bağlantısı",
    inviteText: "Bu, bir modülü birlikte düzenlemek için bir bağlantıdır. Yalnızca tablet ya da bilgisayardaki Weft’te açılabilir, burada açılamaz: Bu oynatıcı modülleri yalnızca oynatır.",
    rotate: "İpucu: Telefonu yatay çevir.",
  },
  pl: {
    mine: "Moje moduły",
    examples: "Przykłady",
    empty: "Nie ma jeszcze modułów. Jeśli ktoś wyśle ci moduł Weft, na przykład mailem lub komunikatorem, otwórz plik tutaj: zostanie zapisany na tym urządzeniu i od razu odtworzony.",
    opening: "Otwieranie …",
    close: "Zamknij",
    remove: "Usuń",
    removeAsk: "Usunąć ten moduł z tego urządzenia?",
    cancel: "Anuluj",
    ok: "OK",
    cannotOpen: "Nie można otworzyć tego modułu.",
    cannotOpenFile: "Nie można otworzyć tego pliku. Czy to plik Weft?",
    inviteTitle: "Link do wspólnej pracy",
    inviteText: "To link do wspólnego edytowania modułu. Można go otworzyć tylko w Weft na tablecie lub komputerze, nie tutaj: ten odtwarzacz tylko odtwarza moduły.",
    rotate: "Wskazówka: obróć telefon poziomo.",
  },
};

export function usePlayerStrings(): Strings {
  return STRINGS[useResolvedLanguage()];
}
