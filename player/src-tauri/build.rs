fn main() {
    // The icons are embedded into the app by tauri::generate_context!, which cargo does not know reads them.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
