use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::Emitter;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let handle = app.handle();

            // Start from Tauri's own default menu (App/Edit/View/Window/Help with the usual
            // native items - Quit, Copy/Paste, fullscreen, ...) and only add to its "File"
            // submenu, rather than rebuilding the whole menu bar by hand.
            let menu = Menu::default(handle)?;
            let file_menu = menu
                .items()?
                .into_iter()
                .find_map(|item| item.as_submenu().filter(|s| s.text().ok().as_deref() == Some("File")).cloned())
                .expect("Menu::default() always includes a File submenu on this platform");
            file_menu.set_text("Datei")?;

            let open_item = MenuItem::with_id(handle, "weft-open", "Öffnen…", true, Some("CmdOrCtrl+O"))?;
            let save_item = MenuItem::with_id(handle, "weft-save", "Speichern", true, Some("CmdOrCtrl+S"))?;
            file_menu.prepend_items(&[&open_item, &save_item, &PredefinedMenuItem::separator(handle)?])?;

            app.set_menu(menu)?;
            app.on_menu_event(|app_handle, event| match event.id().as_ref() {
                "weft-open" => {
                    let _ = app_handle.emit("weft://menu-open", ());
                }
                "weft-save" => {
                    let _ = app_handle.emit("weft://menu-save", ());
                }
                _ => {}
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
