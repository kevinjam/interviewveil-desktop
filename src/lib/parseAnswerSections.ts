export type AnswerSectionKind = "thoughts" | "code" | "complexity" | "default";

export type AnswerSection = {
  kind: AnswerSectionKind;
  title: string | null;
  displayTitle: string | null;
  body: string;
};

export function classifySectionTitle(title: string): AnswerSectionKind {
  const t = title.trim().toLowerCase();
  if (t.startsWith("thoughts")) return "thoughts";
  if (t === "code") return "code";
  if (t.includes("complexity")) return "complexity";
  return "default";
}

/** TechScreen-style labels for known live-assist sections. */
export function displaySectionTitle(title: string, kind: AnswerSectionKind): string {
  if (kind === "thoughts") return "Thoughts (Say to interviewer)";
  if (kind === "code") return "Code";
  return title.trim();
}

/** Split coach markdown on `##` headings; preamble without a heading is one block. */
export function parseAnswerSections(content: string): AnswerSection[] {
  const trimmed = content.trim();
  if (!trimmed) return [];

  const chunks = trimmed.split(/\n(?=##\s+)/);
  const sections: AnswerSection[] = [];

  for (const chunk of chunks) {
    const heading = chunk.match(/^##\s+(.+?)(?:\r?\n|$)([\s\S]*)$/);
    if (heading) {
      const rawTitle = heading[1].trim();
      const kind = classifySectionTitle(rawTitle);
      sections.push({
        kind,
        title: rawTitle,
        displayTitle: displaySectionTitle(rawTitle, kind),
        body: heading[2].trim(),
      });
    } else {
      sections.push({
        kind: "default",
        title: null,
        displayTitle: null,
        body: chunk.trim(),
      });
    }
  }

  return sections;
}
