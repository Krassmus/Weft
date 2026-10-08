//! "In Weft öffnen": .weft files that the system hands to the app (a tap in the Files app, AirDrop, Mail attachments, "Open in ...").
//!
//! On the tablet (iOS) they come in two ways: copied into the app's own folder (`Documents/Inbox`), or - since the app lets other
//! apps open its documents in place (what makes its Documents folder show up in the Files app) - from where they are, which
//! the app may only read with the "security scope" the system gives it for that moment. Either way the file is brought into the
//! library (see src/core/io/library.ts - the same folder, the same naming), unless it is there already, and the page is told
//! to open it: `weft://open-file` (and `take_pending_open_files`, for what came in before the page was listening - the file
//! that started the app).

// (Only the tablet has files handed over this way; the rest is built everywhere so that the command exists everywhere.)
#![cfg_attr(not(target_os = "ios"), allow(dead_code))]

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// What came in and has not been fetched by the page yet. (Global, not Tauri state: the first files arrive while the app is still
/// being started - see ios_open_urls.rs.)
static PENDING: Mutex<Vec<OpenedFile>> = Mutex::new(Vec::new());
/// To tell the page that something came in, once there is a page.
static APP: OnceLock<AppHandle> = OnceLock::new();
/// The paths handed over through the system's own entry point a moment ago (see ios_open_urls.rs): what tao reports on top of that
/// as `RunEvent::Opened` is the same file, and not opened twice.
static RECENT: Mutex<Vec<(PathBuf, Instant)>> = Mutex::new(Vec::new());

/// A file that was opened with Weft: where it is in the library now, or why that didn't work.
#[derive(Serialize, Clone)]
pub struct OpenedFile {
    pub name: String,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn take_pending_open_files() -> Vec<OpenedFile> {
    std::mem::take(&mut *PENDING.lock().unwrap())
}

/// The app is up: files that come in from now on are announced to the page.
pub fn set_app(app: &AppHandle) {
    let _ = APP.set(app.clone());
}

/// The Documents folder of the app (where the library is) - without an AppHandle, for the early entry point.
pub fn documents_dir() -> Option<PathBuf> {
    std::env::var_os("HOME").map(|home| PathBuf::from(home).join("Documents"))
}

/// Brings one .weft file (at `path`, readable now) into the library and queues the result for the page. `handed_over`: it came
/// through the system's own entry point.
pub fn open_file(path: &Path, handed_over: bool) {
    if !path.extension().is_some_and(|extension| extension.eq_ignore_ascii_case("weft")) {
        return;
    }
    {
        let mut recent = RECENT.lock().unwrap();
        recent.retain(|(_, at)| at.elapsed().as_secs() < 10);
        if recent.iter().any(|(seen, _)| seen == path) {
            // Handed over before - and this is what tao reported on top of it.
            if !handed_over {
                return;
            }
        } else if handed_over {
            recent.push((path.to_path_buf(), Instant::now()));
        }
    }
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let opened = match documents_dir().ok_or_else(|| "Der Ordner der Bibliothek ist nicht zu finden.".to_string()).and_then(|documents| bring_into_library(path, &documents)) {
        Ok(library_path) => OpenedFile { name, path: Some(library_path.to_string_lossy().into_owned()), error: None },
        Err(error) => OpenedFile { name, path: None, error: Some(error) },
    };
    PENDING.lock().unwrap().push(opened);
    if let Some(app) = APP.get() {
        let _ = app.emit("weft://open-file", ());
    }
}

/// The .weft files among `urls` as tao reports them (a URL in text form: no access to a file that was opened in place, see
/// ios_open_urls.rs for the entry point that has it).
pub fn handle_opened(urls: &[tauri::Url]) {
    for url in urls {
        if let Ok(path) = url.to_file_path() {
            open_file(&path, false);
        }
    }
}

fn read_file(path: &Path) -> Result<Vec<u8>, String> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(bytes),
        Err(error) => {
            #[cfg(target_os = "ios")]
            if let Some(bytes) = read_in_scope(path) {
                return Ok(bytes);
            }
            Err(format!("Die Datei lässt sich nicht lesen ({error})."))
        }
    }
}

/// Reads a file the system opened in place: access to it is granted for as long as its URL is "being accessed".
#[cfg(target_os = "ios")]
fn read_in_scope(path: &Path) -> Option<Vec<u8>> {
    use objc2_foundation::{NSString, NSURL};
    let url = NSURL::fileURLWithPath(&NSString::from_str(path.to_str()?));
    let started = unsafe { url.startAccessingSecurityScopedResource() };
    let bytes = std::fs::read(path).ok();
    if started {
        unsafe { url.stopAccessingSecurityScopedResource() };
    }
    bytes
}

/// A name that is safe as a file name (the same rules as safeFileName in src/core/io/library.ts).
fn safe_file_name(name: &str) -> String {
    let replaced: String = name.chars().map(|c| if matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') || c.is_control() { '-' } else { c }).collect();
    let collapsed = replaced.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed: String = collapsed.trim_matches(|c: char| c == '.' || c.is_whitespace()).chars().take(80).collect();
    let trimmed = trimmed.trim().to_string();
    if trimmed.is_empty() { "Lernmodul".to_string() } else { trimmed }
}

fn same_place(a: &Path, b: &Path) -> bool {
    match (a.canonicalize(), b.canonicalize()) {
        (Ok(a), Ok(b)) => a == b,
        _ => a == b,
    }
}

/// The file as a file of the library: itself, if it is one; an identical one that is there already, if there is; else a copy.
fn bring_into_library(path: &Path, documents: &Path) -> Result<PathBuf, String> {
    if path.parent().is_some_and(|parent| same_place(parent, documents)) {
        return Ok(path.to_path_buf());
    }
    let bytes = read_file(path)?;
    if !bytes.starts_with(b"PK") {
        return Err("Das ist keine Weft-Datei.".to_string());
    }
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let base = safe_file_name(&stem);

    // The same module that was opened this way before is not copied again: it is the one that is there.
    let mut target = documents.join(format!("{base}.weft"));
    let mut n = 1;
    while target.exists() {
        if std::fs::read(&target).is_ok_and(|existing| existing == bytes) {
            remove_inbox_copy(path, documents);
            return Ok(target);
        }
        n += 1;
        target = documents.join(format!("{base} {n}.weft"));
    }
    let temporary = target.with_extension("weft.tmp");
    std::fs::write(&temporary, &bytes).map_err(|e| format!("Die Datei lässt sich nicht in die Bibliothek kopieren ({e})."))?;
    std::fs::rename(&temporary, &target).map_err(|e| format!("Die Datei lässt sich nicht in die Bibliothek kopieren ({e})."))?;
    remove_inbox_copy(path, documents);
    Ok(target)
}

/// What the system copied into `Documents/Inbox` is only an intermediate: once it is in the library it goes.
fn remove_inbox_copy(path: &Path, documents: &Path) {
    if path.parent().is_some_and(|parent| same_place(parent, &documents.join("Inbox"))) {
        let _ = std::fs::remove_file(path);
    }
}
