import type { ContentBlock, ResponseSection } from "@/types";

const FENCE_RE = /```([\w+#-]*)\n?([\s\S]*?)(?:```|$)/g;

function toBlocks(body: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  let last = 0;
  for (const m of body.matchAll(FENCE_RE)) {
    const before = body.slice(last, m.index).trim();
    if (before) blocks.push({ type: "text", content: before });
    blocks.push({ type: "code", lang: m[1] || "", content: m[2].replace(/\n$/, "") });
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = body.slice(last).trim();
  if (rest) blocks.push({ type: "text", content: rest });
  return blocks;
}

/**
 * Split a (possibly still streaming) markdown response into `## Heading`
 * sections. Text before the first heading becomes an untitled section.
 */
export function parseSections(raw: string): ResponseSection[] {
  const sections: ResponseSection[] = [];
  const parts = raw.split(/^#{1,3}\s+(.+)$/m);
  // parts = [preamble, title1, body1, title2, body2, ...]
  const preamble = parts[0]?.trim();
  if (preamble) sections.push({ title: "", blocks: toBlocks(preamble) });
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i].trim(), blocks: toBlocks(parts[i + 1] ?? "") });
  }
  return sections;
}
