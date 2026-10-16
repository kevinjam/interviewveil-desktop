import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export const MAX_SCREENSHOTS = 7;

/** Queued capture: full image stays on disk; UI only holds a tiny JPEG thumb. */
export interface CapturedScreenshot {
  id: string;
  /** Thumbnail data URL for the strip (not sent to the AI). */
  dataUrl: string;
  filePath: string;
  width: number;
  height: number;
}

interface ScreenshotState {
  items: CapturedScreenshot[];
  add: (item: CapturedScreenshot) => boolean;
  clear: () => void;
  latest: () => CapturedScreenshot | undefined;
}

function broadcast(count: number) {
  void emit("screenshots-changed", count).catch(() => {});
}

function deleteFiles(paths: string[]) {
  if (paths.length === 0) return;
  void invoke("delete_screenshot_files", { paths }).catch(() => {});
}

export const useScreenshotStore = create<ScreenshotState>((set, get) => ({
  items: [],
  add: (item) => {
    const current = get().items;
    if (current.length >= MAX_SCREENSHOTS) return false;
    const items = [...current, item];
    set({ items });
    broadcast(items.length);
    return true;
  },
  clear: () => {
    const paths = get().items.map((i) => i.filePath);
    set({ items: [] });
    broadcast(0);
    deleteFiles(paths);
  },
  latest: () => get().items.at(-1),
}));
