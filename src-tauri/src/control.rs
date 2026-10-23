// The local interface for AI assistants (desktop only): a socket on 127.0.0.1 that the command line tool (`weft`, `weft-mcp`) connects to
// when it is not given a file - then it works on the module that is open in this app, live. The app tells where to find it in
// `control.json` (next to the app's other data: the port and a random password; the file is readable by this user only), and the password
// is asked with every request, so nothing but a program of this user - which could change the saved files as well - gets in.
//
// This side only carries messages: a line of JSON per request -> an event to the page (src/core/control/bridge.ts), which does what is asked
// (reads the module, applies changes as one step of the editor's undo history) and answers with `control_reply` -> a line of JSON back.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

type Reply = (bool, Value);

static PENDING: OnceLock<Mutex<HashMap<u64, mpsc::Sender<Reply>>>> = OnceLock::new();
static NEXT_ID: AtomicU64 = AtomicU64::new(1);
/// How long the page has to answer (a big module takes a moment to hand over).
const ANSWER_TIMEOUT: Duration = Duration::from_secs(120);

fn pending() -> &'static Mutex<HashMap<u64, mpsc::Sender<Reply>>> {
    PENDING.get_or_init(|| Mutex::new(HashMap::new()))
}

fn random_token() -> String {
    let mut bytes = [0u8; 24];
    getrandom::getrandom(&mut bytes).expect("no random numbers");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// The page's answer to a request (see `bridge.ts`; the command itself is `control_reply` in lib.rs).
pub fn deliver_reply(id: u64, ok: bool, payload: Value) {
    if let Some(sender) = pending().lock().unwrap().remove(&id) {
        let _ = sender.send((ok, payload));
    }
}

fn handle_connection(stream: TcpStream, app: AppHandle, token: String) {
    let Ok(mut writer) = stream.try_clone() else { return };
    let reader = BufReader::new(stream);
    for line in reader.lines() {
        let Ok(line) = line else { return };
        if line.trim().is_empty() {
            continue;
        }
        let request: Value = match serde_json::from_str(&line) {
            Ok(value) => value,
            Err(_) => {
                let _ = writeln!(writer, "{}", json!({ "ok": false, "error": "not JSON" }));
                continue;
            }
        };
        let id = request.get("id").cloned().unwrap_or(Value::Null);
        let answer = if request.get("token").and_then(Value::as_str) != Some(token.as_str()) {
            json!({ "id": id, "ok": false, "error": "wrong password" })
        } else {
            let own = NEXT_ID.fetch_add(1, Ordering::SeqCst);
            let (sender, receiver) = mpsc::channel();
            pending().lock().unwrap().insert(own, sender);
            let sent = app.emit(
                "weft://control-request",
                json!({ "id": own, "method": request.get("method"), "params": request.get("params") }),
            );
            if sent.is_err() {
                pending().lock().unwrap().remove(&own);
                json!({ "id": id, "ok": false, "error": "the app's window cannot be reached" })
            } else {
                match receiver.recv_timeout(ANSWER_TIMEOUT) {
                    Ok((true, payload)) => json!({ "id": id, "ok": true, "result": payload }),
                    Ok((false, payload)) => json!({ "id": id, "ok": false, "error": payload }),
                    Err(_) => {
                        pending().lock().unwrap().remove(&own);
                        json!({ "id": id, "ok": false, "error": "the app did not answer in time" })
                    }
                }
            }
        };
        if writeln!(writer, "{}", answer).is_err() {
            return;
        }
    }
}

/// Starts listening and writes control.json. Called once at start-up; a failure only means that the interface is not there.
pub fn start(app: &AppHandle) {
    let Ok(listener) = TcpListener::bind("127.0.0.1:0") else { return };
    let Ok(port) = listener.local_addr().map(|a| a.port()) else { return };
    let token = random_token();
    // (WEFT_CONTROL_FILE: another place, for a second copy of the app that must not take the place of the first - the same variable the tool reads.)
    let file = match std::env::var_os("WEFT_CONTROL_FILE") {
        Some(path) => std::path::PathBuf::from(path),
        None => {
            let Ok(dir) = app.path().app_data_dir() else { return };
            dir.join("control.json")
        }
    };
    if let Some(dir) = file.parent() {
        if std::fs::create_dir_all(dir).is_err() {
            return;
        }
    }
    let info = json!({
        "port": port,
        "token": token,
        "pid": std::process::id(),
        "version": env!("CARGO_PKG_VERSION"),
    });
    if std::fs::write(&file, info.to_string()).is_err() {
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o600));
    }
    let app = app.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let app = app.clone();
            let token = token.clone();
            std::thread::spawn(move || handle_connection(stream, app, token));
        }
    });
}
