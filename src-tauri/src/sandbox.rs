//! The Mac App Store version of the desktop app runs in the App Sandbox: it may only touch what the person has chosen (an open or
//! save dialog, a file that is dropped on it or handed over by the Finder) - and only until it is quit. For Weft that is not enough:
//! "Datei > Zuletzt geöffnet", the autosave of a file that is open, and above all the shared folder of the collaboration (Nextcloud,
//! Dropbox ...) have to work again at the next start without asking for the file or the folder once more.
//!
//! The system's answer to that is the *security-scoped bookmark*: a small piece of data, made while the app has access, that gives the
//! app the same access later. This module makes one for every file or folder the person chooses (`grant_access`, called by the page
//! after a dialog, and by `open_files::open_path` for a file the Finder hands over), keeps the newest few in `bookmarks.json` in the
//! app's own data folder, and opens all of them at the start (`restore`) - before the page is there, so the page can read a "recent"
//! file or start the folder sync as if nothing had happened.
//!
//! Outside the sandbox (a development build, the version outside the store, Windows, Linux, iOS) none of this does anything: the
//! sandbox announces itself by the environment variable `APP_SANDBOX_CONTAINER_ID`.

use std::path::Path;

use tauri::AppHandle;

/// Whether this process runs in the App Sandbox (the Mac App Store version).
pub fn is_sandboxed() -> bool {
    cfg!(target_os = "macos") && std::env::var_os("APP_SANDBOX_CONTAINER_ID").is_some()
}

/// The page asks (to leave out what a sandboxed app may not do, should it ever need to).
#[tauri::command]
pub fn sandboxed() -> bool {
    is_sandboxed()
}

/// The page tells that the person has just chosen `path` (a file they opened or saved, a folder for the shared folder): the access is
/// kept for the next start. Not sandboxed: nothing to do.
#[tauri::command]
pub fn grant_access(app: AppHandle, path: String) -> Result<(), String> {
    if !is_sandboxed() {
        return Ok(());
    }
    remember(&app, Path::new(&path))
}

/// Keeps the access to `path` for the next start (see `grant_access`).
pub fn remember(app: &AppHandle, path: &Path) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    if is_sandboxed() {
        return mac::remember(app, path);
    }
    let _ = (app, path);
    Ok(())
}

/// Opens the access that was kept: called once, while the app is being started.
pub fn restore(app: &AppHandle) {
    #[cfg(target_os = "macos")]
    if is_sandboxed() {
        mac::restore(app);
    }
    let _ = app;
}

#[cfg(target_os = "macos")]
mod mac {
    use std::path::{Path, PathBuf};
    use std::sync::Mutex;

    use objc2::runtime::Bool;
    use objc2_foundation::{NSData, NSString, NSURL, NSURLBookmarkCreationOptions, NSURLBookmarkResolutionOptions};
    use serde::{Deserialize, Serialize};
    use tauri::{AppHandle, Manager};

    /// How many files and folders are kept: the newest. (More than "recent files" and a few shared folders ever need.)
    const MAX_ENTRIES: usize = 100;

    /// One reader or writer of the store at a time.
    static STORE: Mutex<()> = Mutex::new(());

    #[derive(Serialize, Deserialize, Clone)]
    struct Entry {
        path: String,
        /// The bookmark, in hexadecimal (no extra library for it).
        bookmark: String,
    }

    fn store_file(app: &AppHandle) -> Option<PathBuf> {
        let dir = app.path().app_data_dir().ok()?;
        std::fs::create_dir_all(&dir).ok()?;
        Some(dir.join("bookmarks.json"))
    }

    fn load(file: &Path) -> Vec<Entry> {
        std::fs::read(file).ok().and_then(|bytes| serde_json::from_slice(&bytes).ok()).unwrap_or_default()
    }

    fn save(file: &Path, entries: &[Entry]) {
        if let Ok(json) = serde_json::to_vec(entries) {
            let _ = std::fs::write(file, json);
        }
    }

    fn to_hex(bytes: &[u8]) -> String {
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    fn from_hex(text: &str) -> Option<Vec<u8>> {
        if text.len() % 2 != 0 {
            return None;
        }
        (0..text.len()).step_by(2).map(|i| u8::from_str_radix(text.get(i..i + 2)?, 16).ok()).collect()
    }

    /// Whether the app can read `path` right now (a file: open it; a folder: list it).
    fn readable(path: &Path) -> bool {
        if path.is_dir() {
            std::fs::read_dir(path).is_ok()
        } else {
            std::fs::File::open(path).is_ok()
        }
    }

    fn url_for(path: &Path) -> Option<objc2::rc::Retained<NSURL>> {
        let text = path.to_str()?;
        Some(NSURL::fileURLWithPath_isDirectory(&NSString::from_str(text), path.is_dir()))
    }

    /// The bookmark of a URL the app can reach right now.
    fn bookmark_of(url: &NSURL) -> Result<Vec<u8>, String> {
        url.bookmarkDataWithOptions_includingResourceValuesForKeys_relativeToURL_error(NSURLBookmarkCreationOptions::WithSecurityScope, None, None)
            .map(|data| data.to_vec())
            .map_err(|error| error.localizedDescription().to_string())
    }

    pub fn remember(app: &AppHandle, path: &Path) -> Result<(), String> {
        let url = url_for(path).ok_or_else(|| "kein gültiger Pfad".to_string())?;
        let bookmark = to_hex(&bookmark_of(&url)?);
        let file = store_file(app).ok_or_else(|| "kein Datenordner".to_string())?;
        let _guard = STORE.lock().unwrap();
        let mut entries = load(&file);
        let key = path.to_string_lossy().into_owned();
        entries.retain(|entry| entry.path != key);
        entries.insert(0, Entry { path: key, bookmark });
        entries.truncate(MAX_ENTRIES);
        save(&file, &entries);
        Ok(())
    }

    pub fn restore(app: &AppHandle) {
        let Some(file) = store_file(app) else { return };
        let _guard = STORE.lock().unwrap();
        let entries = load(&file);
        let mut kept: Vec<Entry> = Vec::with_capacity(entries.len());
        let mut opened = 0;
        for mut entry in entries {
            let Some(bytes) = from_hex(&entry.bookmark) else { continue };
            let readable_before = readable(Path::new(&entry.path));
            let data = NSData::with_bytes(&bytes);
            let mut stale = Bool::NO;
            let resolved = unsafe {
                NSURL::URLByResolvingBookmarkData_options_relativeToURL_bookmarkDataIsStale_error(
                    &data,
                    NSURLBookmarkResolutionOptions::WithSecurityScope,
                    None,
                    &mut stale,
                )
            };
            let Ok(url) = resolved else {
                // The file or the folder is gone (or was never ours to keep): it drops out of the store.
                continue;
            };
            // Access stays open for as long as the app runs (that is the point), so the URL is not given back.
            if unsafe { url.startAccessingSecurityScopedResource() } {
                opened += 1;
                if stale.as_bool() {
                    if let Ok(fresh) = bookmark_of(&url) {
                        entry.bookmark = to_hex(&fresh);
                    }
                }
                if let Some(path) = url.path() {
                    entry.path = path.to_string();
                }
                eprintln!("[weft] sandbox: {} - readable before: {readable_before}, after: {}", entry.path, readable(Path::new(&entry.path)));
                std::mem::forget(url);
                kept.push(entry);
            }
        }
        save(&file, &kept);
        eprintln!("[weft] sandbox: access to {opened} files and folders restored");
    }
}
