import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useAuthStore } from "@/stores/authStore";

/** Overlay webviews return to the login card when the session is gone. */
export function useExitOverlayWhenSignedOut() {
  const token = useAuthStore((s) => s.token);
  const [hydrated, setHydrated] = useState(() => useAuthStore.persist.hasHydrated());

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => setHydrated(true));
    if (useAuthStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  useEffect(() => {
    if (!hydrated || token) return;
    // Island/chat hydrate while the login card is up. Don't yank back to login
    // until the overlay has actually been entered.
    void invoke<boolean>("is_overlay_active")
      .then((active) => {
        if (active) return invoke("exit_overlay");
      })
      .catch(() => {});
  }, [hydrated, token]);
}
