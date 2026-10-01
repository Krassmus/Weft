// A native menu bar (and the separate "settings" window a menu click opens - see
// show_settings_window) is a desktop-only concept: tauri::menu itself is #[cfg(desktop)]-gated
// inside the tauri crate (there's no menu bar on iOS), and AppHandle::set_menu/on_menu_event and
// WebviewWindowBuilder::minimizable() only exist on desktop platforms too. Everything below that
// touches any of that is gated the same way - see run()'s own setup closure and
// set_menu_language for how mobile still compiles (and behaves correctly - Settings lives in the
// in-app sidebar tab there instead, needing no native menu item to open it) without any of it.
#[cfg(desktop)]
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
#[cfg(desktop)]
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri::AppHandle;

/// The handful of native-menu strings that need to follow the user's chosen language - kept in
/// sync with src/core/i18n/translations.ts by hand, since Rust and the frontend bundle have no
/// way to share a single source of truth for strings. Everything else in the default menu
/// (About/Services/Hide/Quit, Edit, Window, Help) is a PredefinedMenuItem, which the OS already
/// localizes on its own.
#[cfg(desktop)]
struct MenuStrings {
    file: &'static str,
    open: &'static str,
    save: &'static str,
    save_as: &'static str,
    export: &'static str,
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
            open: "Öffnen…",
            save: "Speichern",
            save_as: "Speichern unter…",
            export: "Exportieren…",
            settings: "Einstellungen…",
            edit: "Bearbeiten",
            undo: "Rückgängig",
            redo: "Wiederholen",
        }
    } else {
        MenuStrings {
            file: "File",
            open: "Open…",
            save: "Save",
            save_as: "Save As…",
            export: "Export…",
            settings: "Settings…",
            edit: "Edit",
            undo: "Undo",
            redo: "Redo",
        }
    }
}

/// Builds the whole menu bar fresh for a given language - starting from Tauri's own default menu
/// (App/Edit/View/Window/Help with the usual native items) and only adding to it, rather than
/// rebuilding everything by hand. Called once at startup (before either window has had a chance
/// to say which language it wants) and again every time the frontend calls set_menu_language, so
/// this needs to be idempotent - which Menu::default() already is, since it always constructs a
/// brand new menu rather than mutating shared state.
#[cfg(desktop)]
fn build_menu(app_handle: &AppHandle, lang: &str) -> tauri::Result<Menu<Wry>> {
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
    let open_item = MenuItem::with_id(app_handle, "weft-open", strings.open, true, Some("CmdOrCtrl+O"))?;
    let save_item = MenuItem::with_id(app_handle, "weft-save", strings.save, true, Some("CmdOrCtrl+S"))?;
    let save_as_item = MenuItem::with_id(app_handle, "weft-save-as", strings.save_as, true, Some("CmdOrCtrl+Shift+S"))?;
    let export_item = MenuItem::with_id(app_handle, "weft-export", strings.export, true, Some("CmdOrCtrl+E"))?;
    file_menu.prepend_items(&[
        &open_item,
        &save_item,
        &save_as_item,
        &export_item,
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
        let menu = build_menu(&app, &lang).map_err(|e| e.to_string())?;
        app.set_menu(menu).map_err(|e| e.to_string())?;
    }
    #[cfg(not(desktop))]
    {
        let _ = lang;
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
        .inner_size(420.0, 320.0)
        .resizable(false)
        .minimizable(false)
        .build();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![set_menu_language, read_clipboard_file_paths])
        .setup(|_app| {
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
                let menu = build_menu(handle, "de")?;
                _app.set_menu(menu)?;

                _app.on_menu_event(|app_handle, event| match event.id().as_ref() {
                    "weft-open" => {
                        let _ = app_handle.emit("weft://menu-open", ());
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
