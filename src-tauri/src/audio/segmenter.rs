//! Turns a raw PCM stream into speech segments ready for transcription.
//!
//! Pipeline per incoming block: downmix to mono → resample to 16 kHz →
//! energy-based voice activity detection. A segment is emitted once speech is
//! followed by enough silence, or when it reaches the maximum length.

/// Output sample rate expected by speech-to-text APIs.
pub const TARGET_RATE: u32 = 16_000;

/// 30 ms analysis frames at 16 kHz.
const FRAME_LEN: usize = 480;
/// Audio kept before the first voiced frame so word onsets aren't clipped.
const PRE_ROLL_FRAMES: usize = 10; // 300 ms
/// Silence that closes a segment.
const HANGOVER_FRAMES: usize = 27; // ~800 ms
/// Segments shorter than this much voiced audio are dropped as noise.
const MIN_VOICED_FRAMES: usize = 12; // ~360 ms
/// Hard cap so long monologues still get transcribed progressively.
const MAX_SEGMENT_FRAMES: usize = 600; // 18 s
/// Absolute RMS floor; anything quieter is never considered speech.
const MIN_THRESHOLD: f32 = 0.006;

pub struct Segmenter {
    // Resampler state (linear interpolation).
    src_rate: u32,
    resample_pos: f64,
    last_sample: f32,

    pending: Vec<f32>,
    pre_roll: Vec<Vec<f32>>,
    segment: Vec<f32>,
    in_speech: bool,
    voiced_frames: usize,
    silent_frames: usize,
    noise_floor: f32,
}

impl Segmenter {
    pub fn new() -> Self {
        Self {
            src_rate: 0,
            resample_pos: 0.0,
            last_sample: 0.0,
            pending: Vec::with_capacity(FRAME_LEN * 4),
            pre_roll: Vec::with_capacity(PRE_ROLL_FRAMES),
            segment: Vec::new(),
            in_speech: false,
            voiced_frames: 0,
            silent_frames: 0,
            noise_floor: 0.002,
        }
    }

    /// Feed interleaved samples. Returns any segments (16 kHz mono) that completed.
    pub fn push(&mut self, samples: &[f32], rate: u32, channels: u16) -> Vec<Vec<f32>> {
        let mono = downmix(samples, channels.max(1) as usize);
        self.resample_into_pending(&mono, rate);

        let mut done = Vec::new();
        let mut offset = 0;
        while self.pending.len() - offset >= FRAME_LEN {
            let frame = self.pending[offset..offset + FRAME_LEN].to_vec();
            offset += FRAME_LEN;
            if let Some(seg) = self.process_frame(frame) {
                done.push(seg);
            }
        }
        self.pending.drain(..offset);
        done
    }

    /// Flush whatever speech is in progress (e.g. when capture stops).
    pub fn finish(&mut self) -> Option<Vec<f32>> {
        if self.in_speech && self.voiced_frames >= MIN_VOICED_FRAMES {
            self.in_speech = false;
            self.voiced_frames = 0;
            self.silent_frames = 0;
            return Some(std::mem::take(&mut self.segment));
        }
        None
    }

    fn resample_into_pending(&mut self, mono: &[f32], rate: u32) {
        if rate == 0 || mono.is_empty() {
            return;
        }
        if rate != self.src_rate {
            self.src_rate = rate;
            self.resample_pos = 0.0;
        }
        if rate == TARGET_RATE {
            self.pending.extend_from_slice(mono);
            return;
        }
        // Positions are measured relative to `last_sample` at index -1.
        let step = rate as f64 / TARGET_RATE as f64;
        let n = mono.len() as f64;
        while self.resample_pos < n - 1.0 {
            let i = self.resample_pos.floor();
            let frac = (self.resample_pos - i) as f32;
            let idx = i as isize;
            let a = if idx < 0 { self.last_sample } else { mono[idx as usize] };
            let b = mono[(idx + 1) as usize];
            self.pending.push(a + (b - a) * frac);
            self.resample_pos += step;
        }
        self.resample_pos -= n;
        self.last_sample = *mono.last().unwrap_or(&0.0);
    }

    fn process_frame(&mut self, frame: Vec<f32>) -> Option<Vec<f32>> {
        let rms = (frame.iter().map(|s| s * s).sum::<f32>() / frame.len() as f32).sqrt();
        let threshold = (self.noise_floor * 3.0).max(MIN_THRESHOLD);
        let voiced = rms > threshold;

        if !voiced {
            // Track background level slowly so steady fans/hum don't count as speech.
            self.noise_floor = self.noise_floor * 0.95 + rms * 0.05;
        }

        if !self.in_speech {
            if voiced {
                self.in_speech = true;
                self.voiced_frames = 1;
                self.silent_frames = 0;
                self.segment = self.pre_roll.drain(..).flatten().collect();
                self.segment.extend_from_slice(&frame);
            } else {
                if self.pre_roll.len() == PRE_ROLL_FRAMES {
                    self.pre_roll.remove(0);
                }
                self.pre_roll.push(frame);
            }
            return None;
        }

        self.segment.extend_from_slice(&frame);
        if voiced {
            self.voiced_frames += 1;
            self.silent_frames = 0;
        } else {
            self.silent_frames += 1;
        }

        let too_long = self.segment.len() >= MAX_SEGMENT_FRAMES * FRAME_LEN;
        if self.silent_frames >= HANGOVER_FRAMES || too_long {
            let enough = self.voiced_frames >= MIN_VOICED_FRAMES;
            self.in_speech = false;
            self.voiced_frames = 0;
            self.silent_frames = 0;
            let seg = std::mem::take(&mut self.segment);
            return enough.then_some(seg);
        }
        None
    }
}

fn downmix(samples: &[f32], channels: usize) -> Vec<f32> {
    if channels == 1 {
        return samples.to_vec();
    }
    samples
        .chunks_exact(channels)
        .map(|c| c.iter().sum::<f32>() / channels as f32)
        .collect()
}

/// Encode 16 kHz mono f32 samples as a 16-bit PCM WAV file.
pub fn encode_wav(samples: &[f32]) -> Vec<u8> {
    let data_len = (samples.len() * 2) as u32;
    let mut out = Vec::with_capacity(44 + data_len as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36 + data_len).to_le_bytes());
    out.extend_from_slice(b"WAVEfmt ");
    out.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    out.extend_from_slice(&1u16.to_le_bytes()); // PCM
    out.extend_from_slice(&1u16.to_le_bytes()); // mono
    out.extend_from_slice(&TARGET_RATE.to_le_bytes());
    out.extend_from_slice(&(TARGET_RATE * 2).to_le_bytes()); // byte rate
    out.extend_from_slice(&2u16.to_le_bytes()); // block align
    out.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_len.to_le_bytes());
    for s in samples {
        let v = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        out.extend_from_slice(&v.to_le_bytes());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tone(secs: f32, rate: u32, amp: f32) -> Vec<f32> {
        let n = (secs * rate as f32) as usize;
        (0..n)
            .map(|i| amp * (i as f32 * 440.0 * std::f32::consts::TAU / rate as f32).sin())
            .collect()
    }

    #[test]
    fn emits_segment_after_speech_then_silence() {
        let mut seg = Segmenter::new();
        let mut out = seg.push(&vec![0.0; 48_000], 48_000, 1);
        out.extend(seg.push(&tone(1.5, 48_000, 0.3), 48_000, 1));
        assert!(out.is_empty(), "segment should not close while speaking");
        out.extend(seg.push(&vec![0.0; 48_000], 48_000, 1));
        assert_eq!(out.len(), 1);
        let secs = out[0].len() as f32 / TARGET_RATE as f32;
        assert!((1.5..3.0).contains(&secs), "unexpected length {secs}");
    }

    #[test]
    fn ignores_silence_and_short_clicks() {
        let mut seg = Segmenter::new();
        let mut out = seg.push(&vec![0.0; 32_000], 16_000, 1);
        out.extend(seg.push(&tone(0.1, 16_000, 0.5), 16_000, 1));
        out.extend(seg.push(&vec![0.0; 32_000], 16_000, 1));
        assert!(out.is_empty());
        assert!(seg.finish().is_none());
    }

    #[test]
    fn downmixes_stereo_and_flushes_on_finish() {
        let mono = tone(1.0, 44_100, 0.3);
        let stereo: Vec<f32> = mono.iter().flat_map(|s| [*s, *s]).collect();
        let mut seg = Segmenter::new();
        assert!(seg.push(&stereo, 44_100, 2).is_empty());
        let flushed = seg.finish().expect("in-progress speech should flush");
        assert!(flushed.len() > TARGET_RATE as usize / 2);
    }

    #[test]
    fn wav_header_is_valid() {
        let wav = encode_wav(&[0.0, 0.5, -0.5]);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..12], b"WAVE");
        assert_eq!(wav.len(), 44 + 6);
    }
}
