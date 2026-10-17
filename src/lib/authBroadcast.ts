import { listen } from "@tauri-apps/api/event";
import { useAuthStore } from "@/stores/authStore";

let installed = false;

/** Keep island / chat / login auth state in sync when one webview signs out. */
export function installAuthBroadcast(): void {
  if (installed) return;
  installed = true;
  void listen("auth-signed-out", () => {
    useAuthStore.getState().signOutLocal();
  }).catch(() => {});
}
