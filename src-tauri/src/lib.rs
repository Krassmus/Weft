// A native menu bar (and the separate "settings" window a menu click opens - see
// show_settings_window) is a desktop-only concept: tauri::menu itself is #[cfg(desktop)]-gated
// inside the tauri crate (there's no menu bar on iOS), and AppHandle::set_menu/on_menu_event and
// WebviewWindowBuilder::minimizable() only exist on desktop platforms too. Everything below that
// touches any of that is gated the same way - see run()'s own setup closure and
// set_menu_language for how mobile still compiles (and behaves correctly - Settings lives in the
// in-app sidebar tab there instead, needing no native menu item to open it) without any of it.
#[cfg(desktop)]
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
#[cfg(desktop)]
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Wry};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
#[cfg(desktop)]
use std::sync::Mutex;
use tauri::AppHandle;

// Closing the window or quitting (Cmd+Q) doesn't end the app right away: the frontend is asked to
// finish saving first (see requestFlushBeforeExit in src/features/editor/EditorShell.tsx and
// core/io/autosave.ts), then ends the app itself via `exit_app`. PENDING is true from the request
// until the frontend either exits or calls `cancel_exit` (the user chose to keep working after a
// failed save); GENERATION tells the watchdog thread below which request it belongs to.
static PENDING: AtomicBool = AtomicBool::new(false);
static GENERATION: AtomicU64 = AtomicU64::new(0);
// If the frontend never answers (e.g. its page is dead), the app still has to be quittable.
#[cfg(desktop)]
const EXIT_WATCHDOG_SECS: u64 = 60;

#[cfg(desktop)]
fn request_flush_before_exit(app_handle: &AppHandle) {
    // A second close/quit click while the first is still being saved just waits for it.
    if PENDING.swap(true, Ordering::SeqCst) {
        return;
    }
    let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;
    let _ = app_handle.emit("weft://flush-before-exit", ());
    let handle = app_handle.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(EXIT_WATCHDOG_SECS));
        if PENDING.load(Ordering::SeqCst) && GENERATION.load(Ordering::SeqCst) == generation {
            handle.exit(0);
        }
    });
}

/// Ends the app for real - called by the frontend once everything is saved (or the user chose to
/// quit anyway). Passes through request_flush_before_exit's own interception, which only holds
/// back exits that don't carry an exit code.
#[tauri::command]
fn exit_app(app_handle: AppHandle) {
    app_handle.exit(0);
}

/// The frontend decided not to quit after all (see PENDING).
#[tauri::command]
fn cancel_exit() {
    PENDING.store(false, Ordering::SeqCst);
}

/// The handful of native-menu strings that need to follow the user's chosen language - kept in
/// sync with src/core/i18n/translations.ts by hand, since Rust and the frontend bundle have no
/// way to share a single source of truth for strings. Everything else in the default menu
/// (About/Services/Hide/Quit, Edit, Window, Help) is a PredefinedMenuItem, which the OS already
/// localizes on its own.
#[cfg(desktop)]
struct MenuStrings {
    file: &'static str,
    new: &'static str,
    duplicate: &'static str,
    open: &'static str,
    recent: &'static str,
    no_recent: &'static str,
    join: &'static str,
    save: &'static str,
    save_as: &'static str,
    export: &'static str,
    export_player: &'static str,
    merge: &'static str,
    settings: &'static str,
    edit: &'static str,
    undo: &'static str,
    redo: &'static str,
}

#[cfg(desktop)]
fn menu_strings(lang: &str) -> MenuStrings {
    if lang == "de" {
        MenuStrings {
            file: "Datei",
            new: "Neu",
            duplicate: "Duplizieren",
            open: "Öffnen…",
            recent: "Zuletzt bearbeitet",
            no_recent: "Keine Dateien",
            join: "Einladung beitreten…",
            save: "Speichern",
            save_as: "Speichern unter…",
            export: "Exportieren…",
            export_player: "Player-Datei exportieren…",
            merge: "Mit Datei zusammenführen…",
            settings: "Einstellungen…",
            edit: "Bearbeiten",
            undo: "Rückgängig",
            redo: "Wiederholen",
        }
    } else {
        MenuStrings {
            file: "File",
            new: "New",
            duplicate: "Duplicate",
            open: "Open…",
            recent: "Open Recent",
            no_recent: "No Files",
            join: "Join Invitation…",
            save: "Save",
            save_as: "Save As…",
            export: "Export…",
            export_player: "Export Player File…",
            merge: "Merge with File…",
            settings: "Settings…",
            edit: "Edit",
            undo: "Undo",
            redo: "Redo",
        }
    }
}

/// What the menu is built from besides the language-independent items: the language it was last
/// asked for, and the files "Zuletzt bearbeitet" offers (the frontend keeps that list and tells us
/// via set_recent_files - the menu is rebuilt whenever either changes).
#[cfg(desktop)]
struct MenuState {
    lang: Mutex<String>,
    recent: Mutex<Vec<String>>,
    /// Weft is showing a player file (see src/features/player/): the items that act on the module being edited
    /// - which then isn't on screen - are greyed out.
    player: Mutex<bool>,
}

/// The menu text of a recent file: its file name, with the folder it is in when another recent file
/// has the same name. ("&" is the escape character of Windows menus.)
#[cfg(desktop)]
fn recent_label(path: &str, all: &[String]) -> String {
    let path = std::path::Path::new(path);
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| path.to_string_lossy().into_owned());
    let clashes = all.iter().filter(|other| std::path::Path::new(other).file_name() == path.file_name()).count() > 1;
    let label = match path.parent().and_then(|dir| dir.file_name()) {
        Some(dir) if clashes => format!("{} — {}", name, dir.to_string_lossy()),
        _ => name,
    };
    label.replace('&', "&&")
}

/// Builds the whole menu bar fresh for a given language - starting from Tauri's own default menu
/// (App/Edit/View/Window/Help with the usual native items) and only adding to it, rather than
/// rebuilding everything by hand. Called once at startup (before either window has had a chance
/// to say which language it wants) and again every time the frontend calls set_menu_language, so
/// this needs to be idempotent - which Menu::default() already is, since it always constructs a
/// brand new menu rather than mutating shared state.
#[cfg(desktop)]
fn build_menu(app_handle: &AppHandle, lang: &str, recent: &[String], player: bool) -> tauri::Result<Menu<Wry>> {
    let strings = menu_strings(lang);
    let menu = Menu::default(app_handle)?;
    let items = menu.items()?;

    // The app menu (macOS only - the leftmost, app-named menu with About/Services/Hide/Quit) is
    // always Menu::default()'s first item on that platform. Settings goes right after About,
    // matching the usual macOS convention of About, —, Settings, —, Services, ...
    if let Some(app_menu) = items.first().and_then(|item| item.as_submenu()) {
        let settings_item = MenuItem::with_id(app_handle, "weft-settings", strings.settings, true, Some("CmdOrCtrl+,"))?;
        app_menu.insert_items(&[&settings_item, &PredefinedMenuItem::separator(app_handle)?], 1)?;
    }

    let mut file_menu = None;
    let mut edit_menu = None;
    for item in &items {
        let Some(submenu) = item.as_submenu() else { continue };
        match submenu.text().ok().as_deref() {
            Some("File") => file_menu = Some(submenu.clone()),
            Some("Edit") => edit_menu = Some(submenu.clone()),
            _ => {}
        }
    }
    let file_menu = file_menu.expect("Menu::default() always includes a File submenu on this platform");
    let edit_menu = edit_menu.expect("Menu::default() always includes an Edit submenu on this platform");

    file_menu.set_text(strings.file)?;
    let new_item = MenuItem::with_id(app_handle, "weft-new", strings.new, true, Some("CmdOrCtrl+N"))?;
    let editing = !player;
    let duplicate_item = MenuItem::with_id(app_handle, "weft-duplicate", strings.duplicate, editing, None::<&str>)?;
    let open_item = MenuItem::with_id(app_handle, "weft-open", strings.open, true, Some("CmdOrCtrl+O"))?;
    // The files opened or saved last (ids "weft-recent-<position>", see on_menu_event).
    let recent_items: Vec<MenuItem<Wry>> = if recent.is_empty() {
        vec![MenuItem::with_id(app_handle, "weft-recent-none", strings.no_recent, false, None::<&str>)?]
    } else {
        recent
            .iter()
            .enumerate()
            .map(|(index, path)| MenuItem::with_id(app_handle, format!("weft-recent-{index}"), recent_label(path, recent), true, None::<&str>))
            .collect::<tauri::Result<_>>()?
    };
    let recent_refs: Vec<&dyn IsMenuItem<Wry>> = recent_items.iter().map(|item| item as &dyn IsMenuItem<Wry>).collect();
    let recent_menu = Submenu::with_items(app_handle, strings.recent, true, &recent_refs)?;
    // Working together: joining somebody's invitation (a link) belongs next to opening a file, merging
    // a copy of the file somebody else changed next to exporting one.
    let join_item = MenuItem::with_id(app_handle, "weft-join", strings.join, true, None::<&str>)?;
    let merge_item = MenuItem::with_id(app_handle, "weft-merge", strings.merge, editing, None::<&str>)?;
    let save_item = MenuItem::with_id(app_handle, "weft-save", strings.save, editing, Some("CmdOrCtrl+S"))?;
    let save_as_item = MenuItem::with_id(app_handle, "weft-save-as", strings.save_as, editing, Some("CmdOrCtrl+Shift+S"))?;
    let export_item = MenuItem::with_id(app_handle, "weft-export", strings.export, editing, Some("CmdOrCtrl+E"))?;
    let export_player_item = MenuItem::with_id(app_handle, "weft-export-player", strings.export_player, editing, None::<&str>)?;
    file_menu.prepend_items(&[
        &new_item,
        &duplicate_item,
        &open_item,
        &recent_menu,
        &join_item,
        &save_item,
        &save_as_item,
        &export_item,
        &export_player_item,
        &merge_item,
        &PredefinedMenuItem::separator(app_handle)?,
    ])?;

    // The platform default Edit menu's Undo/Redo drive the focused WKWebView's own
    // contentEditable undo stack, not the app's own document-level undo/redo (backed by the
    // Zustand store's patch history) - the two can drift apart, which is exactly the mismatch
    // this replaces. Cut/Copy/Paste/Select All are left as the native predefined items; only
    // Undo/Redo specifically get swapped for ones that emit back to the frontend (see
    // EditorShell.tsx's "weft://menu-undo"/"weft://menu-redo" listeners), so Cmd+Z/Shift+Cmd+Z
    // end up doing exactly what the document's own undo/redo does.
    edit_menu.set_text(strings.edit)?;
    let stale_undo_redo: Vec<_> = edit_menu
        .items()?
        .into_iter()
        .filter(|item| {
            item.as_predefined_menuitem()
                .and_then(|p| p.text().ok())
                .map(|t| t == "Undo" || t == "Redo")
                .unwrap_or(false)
        })
        .collect();
    for item in &stale_undo_redo {
        edit_menu.remove(item)?;
    }
    let undo_item = MenuItem::with_id(app_handle, "weft-undo", strings.undo, true, Some("CmdOrCtrl+Z"))?;
    let redo_item = MenuItem::with_id(app_handle, "weft-redo", strings.redo, true, Some("CmdOrCtrl+Shift+Z"))?;
    edit_menu.prepend_items(&[&undo_item, &redo_item])?;

    Ok(menu)
}

/// Called by the frontend (see src/core/i18n/useSyncMenuLanguage.ts) whenever the resolved
/// language changes, including once on launch - Rust has no way to know the preference stored in
/// the webview's own localStorage on its own. macOS's menu bar is a single app-wide bar rather
/// than one per window, so it doesn't matter which of the two windows (main editor or settings)
/// happens to call this. Still registered (and still called unconditionally by the frontend) on
/// mobile - there's just no native menu there for it to update, so it's a no-op rather than an
/// error: the frontend doesn't need to know or care which platform it's running on to call it.
#[tauri::command]
fn set_menu_language(#[cfg_attr(not(desktop), allow(unused_variables))] app: AppHandle, lang: String) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let state = app.state::<MenuState>();
        *state.lang.lock().unwrap() = lang.clone();
        let recent = state.recent.lock().unwrap().clone();
        let player = *state.player.lock().unwrap();
        let menu = build_menu(&app, &lang, &recent, player).map_err(|e| e.to_string())?;
        app.set_menu(menu).map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    {
        let _ = lang;
    }
    Ok(())
}

/// Whether Weft is showing a player file right now (see src/features/player/): the menu items that act on the module
/// being edited are greyed out while it does. A no-op on mobile.
#[tauri::command]
fn set_player_mode(#[cfg_attr(not(desktop), allow(unused_variables))] app: AppHandle, active: bool) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let state = app.state::<MenuState>();
        *state.player.lock().unwrap() = active;
        let lang = state.lang.lock().unwrap().clone();
        let recent = state.recent.lock().unwrap().clone();
        let menu = build_menu(&app, &lang, &recent, active).map_err(|e| e.to_string())?;
        app.set_menu(menu).map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    {
        let _ = active;
    }
    Ok(())
}

/// The files "Datei > Zuletzt bearbeitet" offers, newest first - called by the frontend (see
/// src/core/io/recentFiles.ts), which keeps the list, whenever it changes. A no-op on mobile (no
/// native menu there).
#[tauri::command]
fn set_recent_files(#[cfg_attr(not(desktop), allow(unused_variables))] app: AppHandle, paths: Vec<String>) -> Result<(), String> {
    #[cfg(desktop)]
    {
        let state = app.state::<MenuState>();
        *state.recent.lock().unwrap() = paths.clone();
        let lang = state.lang.lock().unwrap().clone();
        let player = *state.player.lock().unwrap();
        let menu = build_menu(&app, &lang, &paths, player).map_err(|e| e.to_string())?;
        app.set_menu(menu).map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    {
        let _ = paths;
    }
    Ok(())
}

/// The paths of whatever files are currently on the OS clipboard (e.g. Cmd+C on one or more
/// files in Finder) - called from useCopyPaste.ts's paste handling *before* it falls back to
/// tauri-plugin-clipboard-manager's readImage(), which for a Finder file copy specifically
/// returns the generic per-extension icon macOS synthesizes as a fallback "image" representation,
/// not the file's real bytes (see this file's own Cargo.toml comment on the arboard dependency).
/// Reading these paths lets the frontend load the real file from disk instead (already permitted
/// - see capabilities/default.json's fs:allow-read-file scope), keeping the original format
/// intact rather than re-encoding through a lossy pixel round-trip. Empty (never an error) both
/// on mobile, where arboard isn't even a dependency (see Cargo.toml's own target restriction —
/// Finder doesn't exist there anyway), and whenever the clipboard simply holds no file reference
/// at all - either way the frontend's own next fallback step takes over exactly the same way.
#[tauri::command]
fn read_clipboard_file_paths() -> Vec<String> {
    #[cfg(desktop)]
    {
        let Ok(mut clipboard) = arboard::Clipboard::new() else {
            return Vec::new();
        };
        clipboard
            .get()
            .file_list()
            .map(|paths| paths.into_iter().map(|p| p.to_string_lossy().into_owned()).collect())
            .unwrap_or_default()
    }
    #[cfg(not(desktop))]
    {
        Vec::new()
    }
}

/// Shows the settings window, creating it the first time and just focusing it on every
/// subsequent "Einstellungen…"/"Settings…" click - a second window would be confusing (which one
/// reflects reality?), and there's nothing here that needs more than one instance anyway. It's
/// the same frontend bundle as the main window, distinguished only by its "settings" label (see
/// App.tsx's isSettingsWindow()), so no separate HTML entry point is needed. Desktop-only, same as
/// the native menu item ("Einstellungen…"/"Settings…") that's the only thing that ever calls this
/// - mobile reaches the very same settings through the in-app sidebar tab instead (see
/// Sidebar.tsx), no separate window needed there at all.
#[cfg(desktop)]
fn show_settings_window(app_handle: &AppHandle) {
    if let Some(window) = app_handle.get_webview_window("settings") {
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app_handle, "settings", WebviewUrl::App("index.html".into()))
        .title("Weft")
        // Tall enough for everything on it (language, profile with its picture) - and resizable with a
        // floor, because a font size, a translation or a screen can still need more room than this.
        .inner_size(460.0, 580.0)
        .min_inner_size(380.0, 320.0)
        .resizable(true)
        .minimizable(false)
        .build();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg_attr(not(desktop), allow(unused_mut))]
    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.manage(MenuState { lang: Mutex::new("de".to_string()), recent: Mutex::new(Vec::new()), player: Mutex::new(false) });
    }

    // First of all the plugins (it has to be): a second start of the program - which is what a click on
    // a "weft:" link is on Windows and Linux - hands its arguments (the link) to the running one, which
    // the deep-link plugin picks up, and ends. All it needs to do itself is show the window.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    }

    let app = builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|_window, _event| {
            // The main window's close button: hold the close back until the frontend has saved.
            // (The settings window closes normally.) Quitting with Cmd+Q doesn't close windows
            // first - that's caught at the run() loop below instead.
            #[cfg(desktop)]
            if _window.label() == "main" {
                if let tauri::WindowEvent::CloseRequested { api, .. } = _event {
                    api.prevent_close();
                    request_flush_before_exit(_window.app_handle());
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            set_menu_language,
            set_recent_files,
            set_player_mode,
            read_clipboard_file_paths,
            exit_app,
            cancel_exit
        ])
        .setup(|_app| {
            // Windows (unpackaged/dev) and Linux (AppImage) don't have an installer that registers the link
            // scheme, so the program does it itself. (macOS: it is part of the app bundle's Info.plist.)
            #[cfg(any(windows, target_os = "linux"))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }

            // No native menu bar on mobile (see this file's own header comment) - nothing here to
            // build at startup, and nothing to wire menu-item clicks to. Every menu action this
            // would otherwise dispatch (open/save/export/undo/redo, settings) is still reachable
            // on mobile through the app's own in-page UI instead.
            #[cfg(desktop)]
            {
                let handle = _app.handle();

                // German by default at boot, purely as a starting point - the main window calls
                // set_menu_language with the actually-resolved language (system/de/en) within its
                // first render, correcting this before the user has any real chance to notice.
                let menu = build_menu(handle, "de", &[], false)?;
                _app.set_menu(menu)?;

                _app.on_menu_event(|app_handle, event| match event.id().as_ref() {
                    "weft-new" => {
                        let _ = app_handle.emit("weft://menu-new", ());
                    }
                    "weft-duplicate" => {
                        let _ = app_handle.emit("weft://menu-duplicate", ());
                    }
                    id if id.starts_with("weft-recent-") => {
                        // The position in the list the menu was last built from, sent on as that file's path.
                        let index = id["weft-recent-".len()..].parse::<usize>().ok();
                        let path = index.and_then(|i| app_handle.state::<MenuState>().recent.lock().unwrap().get(i).cloned());
                        if let Some(path) = path {
                            let _ = app_handle.emit("weft://menu-open-recent", path);
                        }
                    }
                    "weft-open" => {
                        let _ = app_handle.emit("weft://menu-open", ());
                    }
                    "weft-join" => {
                        let _ = app_handle.emit("weft://menu-join", ());
                    }
                    "weft-merge" => {
                        let _ = app_handle.emit("weft://menu-merge", ());
                    }
                    "weft-save" => {
                        let _ = app_handle.emit("weft://menu-save", ());
                    }
                    "weft-save-as" => {
                        let _ = app_handle.emit("weft://menu-save-as", ());
                    }
                    "weft-export" => {
                        let _ = app_handle.emit("weft://menu-export", ());
                    }
                    "weft-export-player" => {
                        let _ = app_handle.emit("weft://menu-export-player", ());
                    }
                    "weft-undo" => {
                        let _ = app_handle.emit("weft://menu-undo", ());
                    }
                    "weft-redo" => {
                        let _ = app_handle.emit("weft://menu-redo", ());
                    }
                    "weft-settings" => {
                        show_settings_window(app_handle);
                    }
                    _ => {}
                });
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|_app_handle, _event| {
        // Cmd+Q / "Quit" in the app menu / the last window closing: an exit WITHOUT an exit code is
        // the user's, so hold it back until saved. exit_app's own exit carries one (0) and goes
        // straight through.
        #[cfg(desktop)]
        if let tauri::RunEvent::ExitRequested { api, code, .. } = _event {
            if code.is_none() {
                api.prevent_exit();
                request_flush_before_exit(_app_handle);
            }
        }
    });
}
