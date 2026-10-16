//! macOS system audio via ScreenCaptureKit (no BlackHole required).

use super::{CaptureHandle, SampleBlock};
use screencapturekit::prelude::*;
use std::sync::mpsc::{self, Sender};
use std::thread;
use std::time::Duration;

const SAMPLE_RATE: u32 = 48_000;
const CHANNELS: u16 = 2;

pub fn start(tx: Sender<SampleBlock>) -> Result<CaptureHandle, String> {
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    let join = thread::spawn(move || match begin_capture(tx) {
        Ok(stream) => {
            let _ = ready_tx.send(Ok(()));
            while let Err(mpsc::RecvTimeoutError::Timeout) =
                stop_rx.recv_timeout(Duration::from_millis(200))
            {}
            let _ = stream.stop_capture();
        }
        Err(e) => {
            let _ = ready_tx.send(Err(e));
        }
    });

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(CaptureHandle::new(stop_tx, join)),
        Ok(Err(e)) => {
            let _ = join.join();
            Err(e)
        }
        Err(_) => Err("system-audio capture thread exited before ready".into()),
    }
}

fn begin_capture(tx: Sender<SampleBlock>) -> Result<SCStream, String> {
    let content = SCShareableContent::get().map_err(|e| {
        format!(
            "Screen Recording permission is required for system audio ({e})"
        )
    })?;
    let display = content
        .displays()
        .into_iter()
        .next()
        .ok_or_else(|| "no display found for system audio".to_string())?;

    let filter = SCContentFilter::create()
        .with_display(&display)
        .with_excluding_windows(&[])
        .build()
        .map_err(|e| e.to_string())?;

    // Tiny video footprint; we only consume audio buffers.
    let config = SCStreamConfiguration::new()
        .with_width(2)
        .with_height(2)
        .with_captures_audio(true)
        .with_sample_rate(48_000)
        .with_channel_count(2)
        .with_excludes_current_process_audio(true);

    let mut stream = SCStream::new(&filter, &config).map_err(|e| e.to_string())?;
    stream
        .add_output_handler(SystemAudioHandler { tx: tx.clone() }, SCStreamOutputType::Screen)
        .map_err(|e| e.to_string())?;
    stream
        .add_output_handler(SystemAudioHandler { tx }, SCStreamOutputType::Audio)
        .map_err(|e| e.to_string())?;
    stream.start_capture().map_err(|e| e.to_string())?;
    Ok(stream)
}

struct SystemAudioHandler {
    tx: Sender<SampleBlock>,
}

unsafe impl Send for SystemAudioHandler {}
unsafe impl Sync for SystemAudioHandler {}

impl SCStreamOutputTrait for SystemAudioHandler {
    fn did_output_sample_buffer(&self, sample: CMSampleBuffer, output_type: SCStreamOutputType) {
        if output_type != SCStreamOutputType::Audio {
            return;
        }
        if let Ok(audio_buffer_list) = sample.audio_buffer_list() {
            for buffer in &audio_buffer_list {
                let data = buffer.data();
                if data.len() < 4 {
                    continue;
                }
                let samples: Vec<f32> = data
                    .chunks_exact(4)
                    .map(|chunk| f32::from_le_bytes(chunk.try_into().unwrap_or([0; 4])))
                    .collect();
                if samples.is_empty() {
                    continue;
                }
                let _ = self.tx.send(SampleBlock {
                    samples,
                    rate: SAMPLE_RATE,
                    channels: CHANNELS,
                });
            }
        }
    }
}
