// The command line tool and the MCP server that come inside the desktop app (scripts/bundle-cli.mjs puts them into the resources, with a
// Node of their own): where they are, and a link in ~/.local/bin so that `weft` works in a terminal - the link points into the app, so
// every update of the app updates the tool with it. Windows has no such link (it needs rights a normal user lacks): the settings show
// the path there. iOS and a build without the tool (a development build, the Mac App Store) report `available: false`.

use serde::Serialize;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CliInfo {
    /// The tool is part of this app.
    available: bool,
    /// The version of the tool (the app's, when it was bundled).
    version: Option<String>,
    /// The launchers inside the app (`weft`, `weft-mcp`).
    launcher: Option<String>,
    mcp_launcher: Option<String>,
    /// The link that makes `weft` work in a terminal (unix), and whether it is there and points into this app.
    link: Option<String>,
    mcp_link: Option<String>,
    linked: bool,
    /// Whether a link can be made here at all.
    can_link: bool,
    /// `~/.local/bin` (where the links go) - the person has to have it on the PATH.
    link_dir: Option<String>,
    platform: String,
}

fn cli_dir(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().resource_dir().ok()?.join("weft-cli");
    if dir.join("weft").exists() || dir.join("weft.cmd").exists() {
        Some(dir)
    } else {
        None
    }
}

fn describe(app: &AppHandle) -> CliInfo {
    let mut info = CliInfo { platform: std::env::consts::OS.to_string(), ..Default::default() };
    let Some(dir) = cli_dir(app) else { return info };
    info.available = true;
    info.version = std::fs::read_to_string(dir.join("VERSION")).ok().map(|v| v.trim().to_string());
    let windows = cfg!(windows);
    let (cli, mcp) = if windows { ("weft.cmd", "weft-mcp.cmd") } else { ("weft", "weft-mcp") };
    info.launcher = Some(dir.join(cli).to_string_lossy().into_owned());
    info.mcp_launcher = Some(dir.join(mcp).to_string_lossy().into_owned());
    #[cfg(unix)]
    {
        info.can_link = true;
        if let Ok(home) = app.path().home_dir() {
            let bin = home.join(".local").join("bin");
            info.link_dir = Some(bin.to_string_lossy().into_owned());
            let link = bin.join("weft");
            let mcp_link = bin.join("weft-mcp");
            info.link = Some(link.to_string_lossy().into_owned());
            info.mcp_link = Some(mcp_link.to_string_lossy().into_owned());
            let points_here = |link: &PathBuf, target: &PathBuf| std::fs::read_link(link).map(|t| &t == target).unwrap_or(false);
            info.linked = points_here(&link, &dir.join("weft")) && points_here(&mcp_link, &dir.join("weft-mcp"));
        }
    }
    info
}

/// What there is of the tool in this app, and whether `weft` is linked into the terminal.
#[tauri::command]
pub fn cli_info(app: AppHandle) -> CliInfo {
    describe(&app)
}

/// Links `weft` and `weft-mcp` into ~/.local/bin. A link that points elsewhere (an older copy of the app) is replaced; a real file of that
/// name is never touched.
#[tauri::command]
pub fn install_cli_link(app: AppHandle) -> Result<CliInfo, String> {
    #[cfg(unix)]
    {
        let dir = cli_dir(&app).ok_or("This app does not contain the command line tool.")?;
        let home = app.path().home_dir().map_err(|e| e.to_string())?;
        let bin = home.join(".local").join("bin");
        std::fs::create_dir_all(&bin).map_err(|e| format!("{}: {}", bin.display(), e))?;
        for name in ["weft", "weft-mcp"] {
            let link = bin.join(name);
            match std::fs::symlink_metadata(&link) {
                Ok(meta) if meta.file_type().is_symlink() => std::fs::remove_file(&link).map_err(|e| format!("{}: {}", link.display(), e))?,
                Ok(_) => return Err(format!("{} exists and is not a link made by Weft - not replaced.", link.display())),
                Err(_) => {}
            }
            std::os::unix::fs::symlink(dir.join(name), &link).map_err(|e| format!("{}: {}", link.display(), e))?;
        }
        Ok(describe(&app))
    }
    #[cfg(not(unix))]
    {
        let _ = app;
        Err("Links are not made on this system: use the path of the tool.".to_string())
    }
}
