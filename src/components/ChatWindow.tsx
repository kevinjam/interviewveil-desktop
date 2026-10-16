import { GripHorizontal } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";

interface Props {
  children: React.ReactNode;
}

function startChatDrag(e: React.PointerEvent) {
  if (e.button !== 0) return;
  void getCurrentWindow().startDragging();
}

export function ChatWindow({ children }: Props) {
  return (
    <div className="chat-panel relative flex flex-1 min-h-0 flex-col m-1.5 overflow-hidden">
      <div
        className="window-drag grid place-items-center h-5 shrink-0 text-[color-mix(in_srgb,var(--muted)_55%,transparent)] hover:text-[var(--text)] transition-colors"
        data-tauri-drag-region
        onPointerDown={startChatDrag}
      >
        <GripHorizontal className="w-3.5 h-3.5 pointer-events-none" strokeWidth={2.5} />
      </div>
      {children}
    </div>
  );
}
