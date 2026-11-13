// Starts the command line tool (weft.exe) or the MCP server (weft-mcp.exe - the same program under another name) with the Node that
// comes with the app: <package>\weft-cli\weft.exe runs <package>\weft-node.exe <package>\weft-cli\weft.mjs, like weft.cmd next to it.
// Windows starts it through an alias (`weft` in a terminal), in the app's package - so it sees the app's AppData as the app does, and
// finds control.json there for the live connection.

use std::env;
use std::process::{exit, Command};

fn main() {
    let exe = match env::current_exe() {
        Ok(exe) => exe,
        Err(e) => {
            eprintln!("weft: {e}");
            exit(2);
        }
    };
    let dir = exe.parent().expect("an executable is in a folder");
    // Both aliases start this one file (the manifest allows one per app): which one it was, the name it was called with says -
    // `weft-mcp` from an MCP client, ...\WindowsApps\weft-mcp.exe from a shell. (And the file's own name, for weft-mcp.exe next to it.)
    let called_as = |name: &std::path::Path| name.file_stem().is_some_and(|s| s.eq_ignore_ascii_case("weft-mcp"));
    let mcp = env::args_os().next().is_some_and(|arg0| called_as(std::path::Path::new(&arg0))) || called_as(&exe);
    let script = if mcp { "weft-mcp.mjs" } else { "weft.mjs" };
    let node = dir.join("..").join("weft-node.exe");
    if !node.exists() {
        eprintln!("weft: the Node that comes with the app was not found ({}) - is the app complete?", node.display());
        exit(2);
    }
    match Command::new(&node).arg(dir.join(script)).args(env::args_os().skip(1)).status() {
        Ok(status) => exit(status.code().unwrap_or(1)),
        Err(e) => {
            eprintln!("weft: {}: {e}", node.display());
            exit(2);
        }
    }
}
