/**
 * Speech-to-text for spoken practice answers, via the InterviewVeil API
 * (which holds the transcription key and deducts plan listening seconds).
 */
import { API_URL, errorMessage, sessionHeaders } from "@/lib/api";
import { signOutDevice } from "@/lib/signOut";

export interface TranscribeOptions {
  wavBase64: string;
  /** Short hint of recent context; improves accuracy on technical terms. */
  prompt?: string;
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function transcribe(opts: TranscribeOptions): Promise<string> {
  const form = new FormData();
  form.append("file", base64ToBlob(opts.wavBase64, "audio/wav"), "segment.wav");
  if (opts.prompt) form.append("prompt", opts.prompt.slice(-800));

  const res = await fetch(`${API_URL}/v1/audio/transcriptions`, {
    method: "POST",
    headers: sessionHeaders(),
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) void signOutDevice();
    const body = (await res.json().catch(() => null)) as unknown;
    throw new Error(errorMessage(body, `Transcription failed (${res.status})`));
  }
  const json = (await res.json()) as { text?: string };
  return (json.text ?? "").trim();
}

/**
 * Whisper-family models hallucinate stock phrases on silence/noise.
 * Drop those so they never trigger an answer.
 */
const HALLUCINATIONS = [
  /^(thanks|thank you)( (so much|very much))?( for watching)?[.!]*$/i,
  /^(you|bye|okay|ok|um+|uh+|hmm+)[.!]*$/i,
  /^\[?(music|silence|blank_audio|inaudible)\]?$/i,
  /subtitles? by/i,
];

export function isMeaningfulTranscript(text: string): boolean {
  const t = text.trim();
  return t.length > 1 && !HALLUCINATIONS.some((re) => re.test(t));
}
