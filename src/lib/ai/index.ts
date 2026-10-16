import { streamClaude, type StreamImage, type StreamRequest } from "./claude";
import type { Plan } from "@/types";

export interface AskOptions {
  plan: Plan;
  kind: StreamRequest["kind"];
  system: string;
  userMessage: string;
  imageBase64?: string;
  imageMime?: string;
  images?: StreamImage[];
  onDelta: (text: string) => void;
}

export function streamAnswer(opts: AskOptions): Promise<string> {
  return streamClaude({
    plan: opts.plan,
    kind: opts.kind,
    system: opts.system,
    userMessage: opts.userMessage,
    imageBase64: opts.imageBase64,
    imageMime: opts.imageMime,
    images: opts.images,
    onDelta: opts.onDelta,
  });
}
