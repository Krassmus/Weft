//! The iPad's own entry point for "In Weft öffnen" (see open_files.rs for the rest).
//!
//! tao passes on the URLs of files that were opened with the app as text only (`RunEvent::Opened`): what the system handed over
//! with them - the permission to read a file where it is (Files app, Nextcloud, ...), which is only valid for that very `NSURL`
//! - is gone by then. And the file that *started* the app isn't passed on at all (it is in the options of
//! `scene:willConnectToSession:options:`, which tao ignores). So the two methods of tao's scene delegate are wrapped here: the
//! files are looked at first - copied into the library while the permission is still there - and then tao gets the call as before.
//!
//! The wrapping has to be in place before the first scene connects, which is long before the app (Tauri's setup) is up: it is
//! installed as soon as the application has finished launching.

use std::ffi::CStr;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};

use objc2::ffi::NSUInteger;
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{class, msg_send, sel};

use crate::open_files::open_file;

/// The methods as tao had them: called after ours.
static ORIGINAL_OPEN_URLS: AtomicUsize = AtomicUsize::new(0);
static ORIGINAL_WILL_CONNECT: AtomicUsize = AtomicUsize::new(0);

type OpenUrlsFn = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject, *mut AnyObject);
type WillConnectFn = unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject, *mut AnyObject, *mut AnyObject);

/// Call once, before the application starts: the wrapping follows when it has launched.
pub fn install_when_launched() {
    unsafe {
        let center: *mut AnyObject = msg_send![class!(NSNotificationCenter), defaultCenter];
        let name: *mut AnyObject = msg_send![class!(NSString), stringWithUTF8String: c"UIApplicationDidFinishLaunchingNotification".as_ptr()];
        let block = block2::RcBlock::new(|_notification: *mut AnyObject| install());
        let observer: *mut AnyObject = msg_send![center, addObserverForName: name, object: std::ptr::null::<AnyObject>(), queue: std::ptr::null::<AnyObject>(), usingBlock: &*block];
        // (Stays for the whole life of the program - the center holds on to the block.)
        let _ = observer;
    }
}

fn install() {
    let Some(class) = AnyClass::get(CStr::from_bytes_with_nul(b"TaoSceneDelegate\0").unwrap()) else {
        eprintln!("weft: TaoSceneDelegate not found - files can't be opened with Weft");
        return;
    };
    unsafe {
        if ORIGINAL_OPEN_URLS.load(Ordering::SeqCst) != 0 {
            return;
        }
        if let Some(method) = class.instance_method(sel!(scene:openURLContexts:)) {
            let wrapper: OpenUrlsFn = open_url_contexts;
            let original = method.set_implementation(std::mem::transmute::<OpenUrlsFn, Imp>(wrapper));
            ORIGINAL_OPEN_URLS.store(original as usize, Ordering::SeqCst);
        }
        if let Some(method) = class.instance_method(sel!(scene:willConnectToSession:options:)) {
            let wrapper: WillConnectFn = will_connect;
            let original = method.set_implementation(std::mem::transmute::<WillConnectFn, Imp>(wrapper));
            ORIGINAL_WILL_CONNECT.store(original as usize, Ordering::SeqCst);
        }
    }
}

unsafe extern "C-unwind" fn open_url_contexts(this: *mut AnyObject, cmd: Sel, scene: *mut AnyObject, contexts: *mut AnyObject) {
    unsafe {
        take_in(contexts);
        let original = ORIGINAL_OPEN_URLS.load(Ordering::SeqCst);
        if original != 0 {
            let original: OpenUrlsFn = std::mem::transmute::<usize, OpenUrlsFn>(original);
            original(this, cmd, scene, contexts);
        }
    }
}

unsafe extern "C-unwind" fn will_connect(this: *mut AnyObject, cmd: Sel, scene: *mut AnyObject, session: *mut AnyObject, options: *mut AnyObject) {
    unsafe {
        if let Some(options) = options.as_ref() {
            // The file the app was started with.
            let contexts: *mut AnyObject = msg_send![options, URLContexts];
            take_in(contexts);
        }
        let original = ORIGINAL_WILL_CONNECT.load(Ordering::SeqCst);
        if original != 0 {
            let original: WillConnectFn = std::mem::transmute::<usize, WillConnectFn>(original);
            original(this, cmd, scene, session, options);
        }
    }
}

/// The .weft files among the `UIOpenURLContext`s (an NSSet): each is brought into the library while it can be read.
unsafe fn take_in(contexts: *mut AnyObject) {
    unsafe {
        let Some(contexts) = contexts.as_ref() else { return };
        let all: *mut AnyObject = msg_send![contexts, allObjects];
        let Some(all) = all.as_ref() else { return };
        let count: NSUInteger = msg_send![all, count];
        for index in 0..count {
            let context: *mut AnyObject = msg_send![all, objectAtIndex: index];
            let Some(context) = context.as_ref() else { continue };
            let url: *mut AnyObject = msg_send![context, URL];
            let Some(url) = url.as_ref() else { continue };
            let is_file: bool = msg_send![url, isFileURL];
            if !is_file {
                continue;
            }
            let path: *mut AnyObject = msg_send![url, path];
            let Some(path) = path.as_ref() else { continue };
            let utf8: *const std::ffi::c_char = msg_send![path, UTF8String];
            if utf8.is_null() {
                continue;
            }
            let path = CStr::from_ptr(utf8).to_string_lossy().into_owned();
            // The permission to read the file where it is lasts as long as this is "being accessed".
            let started: bool = msg_send![url, startAccessingSecurityScopedResource];
            open_file(Path::new(&path), true);
            if started {
                let _: () = msg_send![url, stopAccessingSecurityScopedResource];
            }
        }
    }
}
