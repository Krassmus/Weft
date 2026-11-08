//! The native side of "Weft Player" (the page is player/, the code it shares with Weft is src/). It is small on purpose: the phone keeps the modules in
//! its Documents folder (the page reads and writes them through the fs plugin), and a module that somebody sends - a tap on a .weft attachment in Mail
//! or a messenger, the Files app, AirDrop - is taken in by the code of Weft itself: it is copied into that folder and announced to the page, which plays
//! it at once. That code is not copied here but used where it lies.

#[path = "../../../src-tauri/src/open_files.rs"]
mod open_files;
#[cfg(target_os = "ios")]
#[path = "../../../src-tauri/src/ios_open_urls.rs"]
mod ios_open_urls;

/// open_files.rs asks this on the desktop (the sandbox of the Mac App Store version of Weft keeps access to a file). The player is for phones; where it is
/// built on a computer all the same (to check it), there is nothing to keep.
#[cfg(desktop)]
mod sandbox {
    pub fn remember(_app: &tauri::AppHandle, _path: &std::path::Path) -> Result<(), String> {
        Ok(())
    }
}

/// The page on the phone is too short. WebKit takes the safe areas (the status bar at the top, the home indicator at the bottom) off the height of the page by
/// itself (the scroll view of the web view has "automatic" content inset adjustment): the page of a 874 points tall screen gets 778, and below it there is
/// black. The page is to use the whole screen - it knows the margins from `env(safe-area-inset-*)` (the page says `viewport-fit=cover`) and keeps clear of them
/// itself - so the adjustment is switched off. WebKit does not lay the page out again for that alone, so the web view is made one point smaller and back.
/// The page asks for this (command `full_screen`) when it has started and after the phone was turned.
#[cfg(target_os = "ios")]
mod full_screen {
    use objc2::runtime::AnyObject;
    use objc2::{msg_send, Encode, Encoding};

    /// UIScrollViewContentInsetAdjustmentBehaviorNever
    const NEVER: isize = 2;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Rect {
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    }
    // (CGRect: {CGPoint={dd}{CGSize=dd}} - four numbers one after the other.)
    unsafe impl Encode for Rect {
        const ENCODING: Encoding = Encoding::Struct("CGRect", &[Encoding::Struct("CGPoint", &[Encoding::Double, Encoding::Double]), Encoding::Struct("CGSize", &[Encoding::Double, Encoding::Double])]);
    }

    pub fn apply(window: &tauri::WebviewWindow) {
        let _ = window.with_webview(|webview| unsafe {
            let Some(view) = (webview.inner() as *mut AnyObject).as_ref() else { return };
            let scroll_view: *mut AnyObject = msg_send![view, scrollView];
            let Some(scroll_view) = scroll_view.as_ref() else { return };
            let () = msg_send![scroll_view, setContentInsetAdjustmentBehavior: NEVER];
            let frame: Rect = msg_send![view, frame];
            let smaller = Rect { height: frame.height - 1.0, ..frame };
            let () = msg_send![view, setFrame: smaller];
            let () = msg_send![view, setFrame: frame];
        });
    }
}

/// The page asks: see `full_screen` above. (Nothing to do where the page already has the whole screen.)
#[tauri::command]
fn full_screen(_window: tauri::WebviewWindow) {
    #[cfg(target_os = "ios")]
    full_screen::apply(&_window);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // The phone: files that are opened with the app are looked at before tao gets them (see ios_open_urls.rs).
    #[cfg(target_os = "ios")]
    ios_open_urls::install_when_launched();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![open_files::take_pending_open_files, full_screen])
        .setup(|app| {
            open_files::set_app(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Weft Player");

    app.run(|_app_handle, _event| {
        // "Open in Weft Player": a .weft file that the system hands over (see open_files.rs).
        #[cfg(any(target_os = "ios", target_os = "macos"))]
        if let tauri::RunEvent::Opened { urls } = &_event {
            open_files::handle_opened(urls);
        }
    });
}
