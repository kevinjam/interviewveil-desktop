export type InterviewMode = "coding" | "system_design" | "behavioral";

export type Difficulty = "easy" | "medium" | "hard";

export type ProgrammingLanguage =
  | "python"
  | "javascript"
  | "typescript"
  | "java"
  | "cpp"
  | "go"
  | "rust"
  | "csharp";

export type Plan = "free" | "essential" | "professional" | "expert";

/** Claude model id; chosen by the server (`GET /config`). */
export type ClaudeModel = string;

/** Languages the coach can answer in. */
export const ANSWER_LANGUAGES = [
  "English",
  "Spanish",
  "French",
  "German",
  "Portuguese",
  "Italian",
  "Chinese",
  "Japanese",
  "Korean",
  "Hindi",
  "Arabic",
  "Swahili",
] as const;

export type AnswerLanguage = (typeof ANSWER_LANGUAGES)[number];

/** A rendered chunk of a markdown section. */
export type ContentBlock =
  | { type: "text"; content: string }
  | { type: "code"; content: string; lang: string };

/** A `## Heading` section of a model response. */
export interface ResponseSection {
  title: string;
  blocks: ContentBlock[];
}
