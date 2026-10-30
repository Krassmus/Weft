// Converting a video to H.264/AAC in an MP4 with the system's own AVAssetExportSession (AVFoundation) - on the iPad, where no ffmpeg can run (an app cannot start
// another program there) and none will ever be installed, and on the Mac, where it needs nothing installed either. The frontend (src/core/io/videoTranscode.ts) asks
// `native_video_conversion_available` first, and falls back to an ffmpeg of the computer where there is no such thing (Windows, Linux) or the file is of a kind
// AVFoundation does not read (a webm, an mkv: AVFoundation reads what the system plays - MP4, MOV, M4V with the codecs of the system).
//
// 1080p at most: the preset never makes a smaller video larger, and a module for a screen has no use for more. The result is an MP4 with the index in front
// (`shouldOptimizeForNetworkUse`), as a web server would serve it. The conversion is hardware-assisted and quick; its progress goes to the page as the event
// "weft://video-progress" (a number from 0 to 1).

/// Whether `native_video_to_h264` can do anything on this platform.
#[tauri::command]
pub fn native_video_conversion_available() -> bool {
    cfg!(any(target_os = "macos", target_os = "ios"))
}

/// Converts the video at `input` into an H.264/AAC MP4 at `output` (a path that does not exist yet). Reports progress as events.
#[tauri::command]
pub async fn native_video_to_h264(app: tauri::AppHandle, input: String, output: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        use tauri::Emitter;
        tauri::async_runtime::spawn_blocking(move || {
            convert(&input, &output, |fraction| {
                let _ = app.emit("weft://video-progress", fraction);
            })
        })
        .await
        .map_err(|e| e.to_string())?
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios")))]
    {
        let _ = (app, input, output);
        Err("unsupported".to_string())
    }
}

/// The conversion itself: starts the export session and waits for it, telling `progress` how far it is every fifth of a second.
#[cfg(any(target_os = "macos", target_os = "ios"))]
fn convert(input: &str, output: &str, progress: impl Fn(f32)) -> Result<(), String> {
    use block2::RcBlock;
    use objc2_av_foundation::{
        AVAssetExportPreset1920x1080, AVAssetExportSession, AVAssetExportSessionStatus, AVFileTypeMPEG4, AVURLAsset,
    };
    use objc2_foundation::{NSString, NSURL};
    use std::sync::mpsc::{channel, RecvTimeoutError};
    use std::time::Duration;

    // (A file of that name is no place to export to: the session fails.)
    let _ = std::fs::remove_file(output);
    unsafe {
        let input_url = NSURL::fileURLWithPath(&NSString::from_str(input));
        let output_url = NSURL::fileURLWithPath(&NSString::from_str(output));
        let asset = AVURLAsset::URLAssetWithURL_options(&input_url, None);
        let session = AVAssetExportSession::exportSessionWithAsset_presetName(&asset, AVAssetExportPreset1920x1080)
            .ok_or_else(|| "The system cannot convert this file.".to_string())?;
        session.setOutputURL(Some(&output_url));
        session.setOutputFileType(AVFileTypeMPEG4);
        session.setShouldOptimizeForNetworkUse(true);

        let (done, finished) = channel::<()>();
        let handler = RcBlock::new(move || {
            let _ = done.send(());
        });
        session.exportAsynchronouslyWithCompletionHandler(&handler);
        loop {
            match finished.recv_timeout(Duration::from_millis(200)) {
                Ok(()) | Err(RecvTimeoutError::Disconnected) => break,
                Err(RecvTimeoutError::Timeout) => progress(session.progress()),
            }
        }
        if session.status() == AVAssetExportSessionStatus::Completed {
            progress(1.0);
            return Ok(());
        }
        let _ = std::fs::remove_file(output);
        Err(match session.error() {
            Some(error) => error.localizedDescription().to_string(),
            None => "The conversion did not finish.".to_string(),
        })
    }
}

#[cfg(all(test, any(target_os = "macos", target_os = "ios")))]
mod tests {
    /// By hand, with a video of your own: `WEFT_TEST_VIDEO=in.mov WEFT_TEST_OUT=out.mp4 cargo test native_video -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn converts_a_video_given_by_the_environment() {
        let input = std::env::var("WEFT_TEST_VIDEO").expect("WEFT_TEST_VIDEO");
        let output = std::env::var("WEFT_TEST_OUT").expect("WEFT_TEST_OUT");
        super::convert(&input, &output, |fraction| println!("progress {fraction}")).expect("conversion");
        assert!(std::fs::metadata(&output).map(|meta| meta.len() > 0).unwrap_or(false));
    }
}
