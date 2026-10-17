import { Copy } from "lucide-react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  type AnswerSectionKind,
  parseAnswerSections,
} from "@/lib/parseAnswerSections";

const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

function markdownComponents(kind: AnswerSectionKind, codeCopyAlways: boolean): Components {
  const tightBullets = kind === "thoughts";
  const codeDominant = kind === "code";

  return {
    h2: ({ children }) => (
      <h2 className="answer-md__inline-h2 mt-3 mb-1 text-[12px] font-semibold text-[var(--text)] first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-2 mb-0.5 text-[12px] font-semibold text-[var(--text)]">{children}</h3>
    ),
    p: ({ children }) => (
      <p
        className={
          kind === "complexity"
            ? "mb-0 text-[12px] leading-snug text-[var(--muted)]"
            : "mb-1.5 last:mb-0 whitespace-pre-wrap leading-snug"
        }
      >
        {children}
      </p>
    ),
    ul: ({ children }) => (
      <ul
        className={
          tightBullets
            ? "mb-0 list-disc pl-[1.15rem] space-y-1 leading-snug"
            : "mb-2 list-disc pl-5 space-y-0.5"
        }
      >
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mb-2 list-decimal pl-5 space-y-0.5 leading-snug">{children}</ol>
    ),
    li: ({ children }) => <li className="text-[var(--text)]">{children}</li>,
    strong: ({ children }) => <strong className="font-semibold text-[var(--text)]">{children}</strong>,
    code: ({ className, children, ...props }) => {
      const inline = !className;
      if (inline) {
        return (
          <code
            className="px-1 py-0.5 rounded bg-[var(--panel-2)] text-[12px] font-mono text-[#e6edf3]"
            {...props}
          >
            {children}
          </code>
        );
      }
      const text = String(children).replace(/\n$/, "");
      return (
        <div className={`relative group ${codeDominant ? "my-0" : "my-2"}`}>
          <button
            type="button"
            onClick={() => copy(text)}
            aria-label="Copy code"
            className={`window-no-drag absolute right-2 top-2 text-[#94a3b8] hover:text-white z-10 transition-opacity ${
              codeCopyAlways ? "opacity-80 hover:opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <pre
            className={`rounded-[var(--radius-sm)] border border-[var(--code-border)] overflow-x-auto font-mono text-[#e6edf3] ${
              codeDominant ? "answer-md__code-block p-3.5 text-[13px] leading-[1.45]" : "p-3 text-xs"
            }`}
            style={{ background: "var(--code-bg)" }}
          >
            <code className={className} {...props}>{children}</code>
          </pre>
        </div>
      );
    },
  };
}

function SectionBody({ body, kind }: { body: string; kind: AnswerSectionKind }) {
  if (!body) return null;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={markdownComponents(kind, kind === "code")}
    >
      {body}
    </ReactMarkdown>
  );
}

function SectionHeading({ kind, title }: { kind: AnswerSectionKind; title: string }) {
  if (kind === "thoughts" || kind === "code") {
    return <h2 className="answer-md__section-title answer-md__section-title--live">{title}</h2>;
  }
  if (kind === "complexity") {
    return <h2 className="answer-md__section-title answer-md__section-title--meta">{title}</h2>;
  }
  return (
    <h2 className="answer-md__section-title answer-md__section-title--default">{title}</h2>
  );
}

/** Full GFM + syntax highlighting for coach answers (TechScreen-style sections). */
export function AnswerMarkdown({ content }: { content: string }) {
  const sections = parseAnswerSections(content);
  const useSections = sections.some((s) => s.title !== null);

  if (!useSections) {
    return (
      <div className="answer-md text-[13.5px] text-[var(--text)]">
        <SectionBody body={content} kind="default" />
      </div>
    );
  }

  return (
    <div className="answer-md answer-md--sections text-[13.5px] text-[var(--text)]">
      {sections.map((section, i) => (
        <section
          key={`${section.displayTitle ?? "block"}-${i}`}
          className={`answer-md__section answer-md__section--${section.kind}`}
          data-section={section.kind}
        >
          {section.displayTitle && (
            <SectionHeading kind={section.kind} title={section.displayTitle} />
          )}
          <SectionBody body={section.body} kind={section.kind} />
        </section>
      ))}
    </div>
  );
}
