fn main() {
    // The icons are embedded into the app by tauri::generate_context!, which cargo does not know reads them: without this a
    // replaced icon is not picked up until some Rust file changes (the old one stays in the dev app's dock icon).
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
