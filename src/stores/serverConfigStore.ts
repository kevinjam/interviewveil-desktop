import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiFetch } from "@/lib/api";
import type { Difficulty } from "@/types";

/**
 * Practice settings decided by the InterviewVeil API, not the user. (The model is
 * routed per plan on the server and shown via the account.)
 */
interface ServerConfig {
  difficulty: Difficulty;
}

interface ServerConfigState extends ServerConfig {
  set: (c: ServerConfig) => void;
}

export const useServerConfigStore = create<ServerConfigState>()(
  persist(
    (set) => ({
      difficulty: "medium",
      set: (c) => set(c),
    }),
    { name: "interviewveil-server-config" },
  ),
);

/** Refresh from `GET /config`; keeps the last known values when offline. */
export async function refreshServerConfig(): Promise<void> {
  try {
    useServerConfigStore.getState().set(await apiFetch<ServerConfig>("/config"));
  } catch {
    // offline: keep cached config
  }
}
