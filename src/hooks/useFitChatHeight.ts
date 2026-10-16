import { useLayoutEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Grip + panel margins — Tech Screen `CHROME_HEIGHT`. */
const CHROME_HEIGHT = 48;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 620;

/**
 * Resize the chat overlay to the answer body (Tech Screen `setChatHeight`).
 * Window grows with the stream up to 620px, then the inner pane scrolls.
 */
export function useFitChatHeight(deps: unknown[]) {
  useLayoutEffect(() => {
    const body = document.getElementById("practice-body");
    if (!body) return;

    let last = 0;
    const apply = () => {
      const strip = document.getElementById("screenshot-strip");
      const height = Math.max(
        MIN_HEIGHT,
        Math.min(
          MAX_HEIGHT,
          Math.ceil(body.scrollHeight) + CHROME_HEIGHT + (strip?.offsetHeight ?? 0),
        ),
      );
      if (height === last) return;
      last = height;
      invoke("set_chat_height", { height }).catch(() => {});
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(body);
    const strip = document.getElementById("screenshot-strip");
    if (strip) observer.observe(strip);
    return () => observer.disconnect();
    // Content swaps empty ↔ streaming; rebind so we observe the current node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
