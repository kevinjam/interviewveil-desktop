import { invoke } from "@tauri-apps/api/core";
import { MAX_SCREENSHOTS, useScreenshotStore } from "@/stores/screenshotStore";

/** Rust `take_screenshot` — metadata + thumb only (Tech Screen style). */
export interface ScreenshotResult {
  id: string;
  width: number;
  height: number;
  thumbBase64: string;
  thumbMime: string;
  filePath: string;
}

export function useScreenshot() {
  const add = useScreenshotStore((s) => s.add);

  const capture = async (): Promise<ScreenshotResult | null> => {
    if (useScreenshotStore.getState().items.length >= MAX_SCREENSHOTS) {
      return null;
    }
    const shot = await invoke<ScreenshotResult>("take_screenshot");
    const mime = shot.thumbMime || "image/jpeg";
    const added = add({
      id: shot.id,
      width: shot.width,
      height: shot.height,
      filePath: shot.filePath,
      dataUrl: `data:${mime};base64,${shot.thumbBase64}`,
    });
    return added ? shot : null;
  };

  return { capture };
}
