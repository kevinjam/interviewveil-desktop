//! Microphone capture via cpal.

use super::{CaptureHandle, SampleBlock};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use std::sync::mpsc::{self, Sender};
use std::thread;
use std::time::Duration;

/// Returns an error early if no input device exists (used for startup diagnostics).
pub fn probe() -> Result<(), String> {
    let device = cpal::default_host()
        .default_input_device()
        .ok_or_else(|| "no microphone found".to_string())?;
    device.default_input_config().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn start(tx: Sender<SampleBlock>) -> Result<CaptureHandle, String> {
    spawn_cpal_capture(tx, "microphone", |host| {
        let device = host
            .default_input_device()
            .ok_or_else(|| "no microphone found".to_string())?;
        let config = device.default_input_config().map_err(|e| e.to_string())?;
        Ok((device, config))
    })
}

/// Open the first input device whose name matches `predicate` (used for loopback / virtual cables).
pub fn start_matching<P>(
    tx: Sender<SampleBlock>,
    label: &'static str,
    predicate: P,
) -> Result<CaptureHandle, String>
where
    P: Fn(&str) -> bool + Send + 'static,
{
    spawn_cpal_capture(tx, label, move |host| {
        for device in host.input_devices().map_err(|e| e.to_string())? {
            let name = device.name().unwrap_or_default();
            if predicate(&name) {
                let config = device.default_input_config().map_err(|e| e.to_string())?;
                return Ok((device, config));
            }
        }
        Err(format!("no {label} input device found"))
    })
}

/// Runs a cpal input stream on a dedicated thread (cpal streams are `!Send`)
/// and forwards every callback buffer to `tx`. Blocks until the stream is
/// running or has failed, so callers get a real error message.
fn spawn_cpal_capture<F>(
    tx: Sender<SampleBlock>,
    label: &'static str,
    open: F,
) -> Result<CaptureHandle, String>
where
    F: FnOnce(&cpal::Host) -> Result<(cpal::Device, cpal::SupportedStreamConfig), String>
        + Send
        + 'static,
{
    let (stop_tx, stop_rx) = mpsc::channel::<()>();
    let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();

    let join = thread::spawn(move || {
        let host = cpal::default_host();
        let (device, config) = match open(&host) {
            Ok(v) => v,
            Err(e) => {
                let _ = ready_tx.send(Err(e));
                return;
            }
        };
        let rate = config.sample_rate().0;
        let channels = config.channels();
        let stream_config: cpal::StreamConfig = config.clone().into();

        let stream = match config.sample_format() {
            cpal::SampleFormat::F32 => {
                build_stream::<f32>(&device, &stream_config, tx, rate, channels, label)
            }
            cpal::SampleFormat::I16 => {
                build_stream::<i16>(&device, &stream_config, tx, rate, channels, label)
            }
            cpal::SampleFormat::U16 => {
                build_stream::<u16>(&device, &stream_config, tx, rate, channels, label)
            }
            other => Err(format!("unsupported {label} sample format {other:?}")),
        };

        let stream = match stream.and_then(|s| s.play().map(|_| s).map_err(|e| e.to_string())) {
            Ok(s) => s,
            Err(e) => {
                let _ = ready_tx.send(Err(e));
                return;
            }
        };
        let _ = ready_tx.send(Ok(()));

        // Keep the stream alive until asked to stop (or the handle is dropped).
        while let Err(mpsc::RecvTimeoutError::Timeout) =
            stop_rx.recv_timeout(Duration::from_millis(200))
        {}
        drop(stream);
    });

    match ready_rx.recv() {
        Ok(Ok(())) => Ok(CaptureHandle::new(stop_tx, join)),
        Ok(Err(e)) => {
            let _ = join.join();
            Err(e)
        }
        Err(_) => Err(format!("{label} capture thread exited unexpectedly")),
    }
}

fn build_stream<T>(
    device: &cpal::Device,
    config: &cpal::StreamConfig,
    tx: Sender<SampleBlock>,
    rate: u32,
    channels: u16,
    label: &'static str,
) -> Result<cpal::Stream, String>
where
    T: cpal::Sample + cpal::SizedSample,
    f32: cpal::FromSample<T>,
{
    device
        .build_input_stream(
            config,
            move |data: &[T], _: &cpal::InputCallbackInfo| {
                let samples = data.iter().map(|s| cpal::Sample::from_sample(*s)).collect();
                let _ = tx.send(SampleBlock {
                    samples,
                    rate,
                    channels,
                });
            },
            move |err| eprintln!("InterviewVeil: {label} stream error: {err}"),
            None,
        )
        .map_err(|e| e.to_string())
}
