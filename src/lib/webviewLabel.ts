import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export type WebviewLabel = "island" | "chat";

/** Resolve which overlay this webview is (URL param is reliable for secondary windows in dev). */
export function resolveWebviewLabel(): WebviewLabel {
  const fromQuery = new URLSearchParams(window.location.search).get("webview");
  if (fromQuery === "island" || fromQuery === "chat") {
    return fromQuery;
  }
  try {
    const label = getCurrentWebviewWindow().label;
    if (label === "island" || label === "chat") return label;
  } catch {
    /* browser / tests */
  }
  return "chat";
}
