// The eyedropper of the colour picker (src/features/editor/ColorField.tsx): a colour from anywhere on the screen, with the
// system's own magnifier. A WKWebView has no `EyeDropper` (that is Chromium only), so on the Mac the picking is done natively
// by NSColorSampler - the same loupe as in Keynote or Affinity. Windows' WebView2 has the web API itself, the iPad has
// nothing of the kind (an app cannot read other apps' pixels there), so the frontend asks `screen_color_picker_available`
// first and shows the button only where one of the two works.

/// Whether `pick_screen_color` can do anything on this platform.
#[tauri::command]
pub fn screen_color_picker_available() -> bool {
    cfg!(target_os = "macos")
}

/// Lets the person click a pixel anywhere on the screen. `Some("#rrggbb")` for a colour, `None` when they cancelled (Esc).
#[tauri::command]
pub async fn pick_screen_color(app: tauri::AppHandle) -> Result<Option<String>, String> {
    #[cfg(target_os = "macos")]
    {
        let (sender, receiver) = std::sync::mpsc::channel::<Option<String>>();
        app.run_on_main_thread(move || {
            use block2::RcBlock;
            use objc2_app_kit::{NSColor, NSColorSampler, NSColorSpace};
            let sampler = NSColorSampler::new();
            let handler = RcBlock::new(move |color: *mut NSColor| {
                // Null: cancelled.
                let hex = unsafe { color.as_ref() }.and_then(|color| {
                    let rgb = color.colorUsingColorSpace(&NSColorSpace::sRGBColorSpace())?;
                    let channel = |value: f64| (value.clamp(0.0, 1.0) * 255.0).round() as u8;
                    Some(format!(
                        "#{:02x}{:02x}{:02x}",
                        channel(rgb.redComponent()),
                        channel(rgb.greenComponent()),
                        channel(rgb.blueComponent())
                    ))
                });
                let _ = sender.send(hex);
            });
            // The sampler keeps itself alive until the person has chosen or cancelled.
            unsafe { sampler.showSamplerWithSelectionHandler(&handler) };
        })
        .map_err(|e| e.to_string())?;
        tauri::async_runtime::spawn_blocking(move || receiver.recv().map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())?
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = app;
        Err("unsupported".to_string())
    }
}
