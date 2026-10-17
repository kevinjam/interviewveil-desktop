import { invoke } from "@tauri-apps/api/core";
import { useAuthStore } from "@/stores/authStore";

/** Clear session on this device and return to the login card (all webviews). */
export async function signOutDevice(): Promise<void> {
  try {
    await invoke("sign_out");
  } catch {
    useAuthStore.getState().signOutLocal();
  }
}
