//! Practice answer recording: captures the microphone, splits it into speech
//! segments and emits them to the frontend as WAV clips for transcription.
//!
//! Events:
//! - `recording-changed` (bool)
//! - `audio-segment` ([`AudioSegment`])

mod microphone;
#[cfg(target_os = "macos")]
mod macos_sck;
mod segmenter;
mod system_loopback;

use base64::Engine;
use parking_lot::Mutex;
use serde::Serialize;
use std::sync::mpsc::{self, Sender};
use std::thread::{self, JoinHandle};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

/// A block of interleaved PCM samples straight from a capture backend.
pub struct SampleBlock {
    pub samples: Vec<f32>,
    pub rate: u32,
    pub channels: u16,
}

/// Owns a capture thread; stops it when dropped.
pub struct CaptureHandle {
    stop: Option<Sender<()>>,
    join: Option<JoinHandle<()>>,
}

impl CaptureHandle {
    fn new(stop: Sender<()>, join: JoinHandle<()>) -> Self {
        Self {
            stop: Some(stop),
            join: Some(join),
        }
    }
}

impl Drop for CaptureHandle {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(join) = self.join.take() {
            let _ = join.join();
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AudioSegment {
    /// 16 kHz mono 16-bit WAV, base64-encoded.
    pub wav_base64: String,
    pub duration_ms: u64,
    /// Unix time (ms) when the segment ended.
    pub ended_at: u64,
}

#[derive(Default)]
pub struct AudioState {
    captures: Mutex<Vec<CaptureHandle>>,
}

impl AudioState {
    pub fn new() -> Self {
        if let Err(e) = microphone::probe() {
            eprintln!("InterviewVeil: {e}; spoken answers unavailable until a microphone is connected.");
        }
        if let Err(e) = system_loopback::probe() {
            eprintln!("InterviewVeil: {e}; meeting/system audio capture unavailable.");
        }
        Self::default()
    }
}

fn spawn_segment_worker(app: AppHandle) -> Sender<SampleBlock> {
    let (tx, rx) = mpsc::channel::<SampleBlock>();
    thread::spawn(move || {
        let mut seg = segmenter::Segmenter::new();
        // Ends when every sender (the capture callback) is dropped.
        while let Ok(block) = rx.recv() {
            for samples in seg.push(&block.samples, block.rate, block.channels) {
                emit_segment(&app, &samples);
            }
        }
        if let Some(samples) = seg.finish() {
            emit_segment(&app, &samples);
        }
    });
    tx
}

fn emit_segment(app: &AppHandle, samples: &[f32]) {
    let wav = segmenter::encode_wav(samples);
    let segment = AudioSegment {
        wav_base64: base64::engine::general_purpose::STANDARD.encode(wav),
        duration_ms: samples.len() as u64 * 1000 / segmenter::TARGET_RATE as u64,
        ended_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
    };
    if let Err(e) = app.emit("audio-segment", segment) {
        eprintln!("InterviewVeil: failed to emit audio segment: {e}");
    }
}

#[tauri::command]
pub fn start_recording(app: AppHandle, state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let mut captures = state.captures.lock();
    captures.clear();
    // One segmenter; mic is required, system/meeting audio is best-effort.
    let tx = spawn_segment_worker(app.clone());
    captures.push(microphone::start(tx.clone())?);
    match system_loopback::start(tx) {
        Ok(handle) => captures.push(handle),
        Err(e) => eprintln!("InterviewVeil: system audio not started ({e})"),
    }
    app.emit("recording-changed", true)
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn stop_recording_if_active(app: &AppHandle, state: &AudioState) -> Result<(), String> {
    let mut captures = state.captures.lock();
    if captures.is_empty() {
        return Ok(());
    }
    // Drop capture threads off the main thread — joining cpal here during sign-out
    // has caused deadlocks / crashes when the UI thread is handling the command.
    let drained: Vec<CaptureHandle> = captures.drain(..).collect();
    app.emit("recording-changed", false)
        .map_err(|e| e.to_string())?;
    thread::spawn(move || drop(drained));
    Ok(())
}

#[tauri::command]
pub fn stop_recording(app: AppHandle, state: tauri::State<'_, AudioState>) -> Result<(), String> {
    stop_recording_if_active(&app, &state)
}
