import { Copy } from "lucide-react";
import { parseSections } from "@/lib/parseResponse";

const copy = (text: string) => navigator.clipboard.writeText(text).catch(() => {});

/** Renders a (streaming) markdown response as titled sections with code blocks. */
export function SectionsView({ raw }: { raw: string }) {
  const sections = parseSections(raw);
  return (
    <div className="space-y-4">
      {sections.map((section, i) => (
        <section key={`${section.title}-${i}`}>
          {section.title && (
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--brand)]">
              {section.title}
            </h3>
          )}
          <div className="space-y-2">
            {section.blocks.map((block, j) =>
              block.type === "code" ? (
                <div key={j} className="relative group">
                  <button
                    type="button"
                    onClick={() => copy(block.content)}
                    aria-label="Copy code"
                    className="window-no-drag absolute right-2 top-2 text-[#94a3b8] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <pre
                    className="p-3 rounded-[var(--radius-sm)] border border-[var(--code-border)] overflow-x-auto text-xs font-mono text-[#e6edf3]"
                    style={{ background: "var(--code-bg)" }}
                  >
                    <code>{block.content}</code>
                  </pre>
                </div>
              ) : (
                <p key={j} className="text-[var(--text)] whitespace-pre-wrap">
                  {block.content}
                </p>
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
