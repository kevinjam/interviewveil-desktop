import { useScreenshotStore } from "@/stores/screenshotStore";

export function ScreenshotStrip() {
  const items = useScreenshotStore((s) => s.items);

  if (items.length === 0) return null;

  return (
    <div
      id="screenshot-strip"
      className="flex items-center justify-center gap-2 py-1.5 shrink-0 pointer-events-none"
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          className="screenshot-item relative h-[54px] rounded-[var(--radius-sm)] overflow-hidden border border-[var(--material-border)] bg-[var(--material-strong)] opacity-0 scale-90 -translate-y-1.5"
          style={{ "--index": index } as React.CSSProperties}
        >
          <img
            src={item.dataUrl}
            alt="Captured screen"
            className="block h-full w-auto max-w-[120px] object-cover"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
