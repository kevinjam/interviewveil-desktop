import { create } from "zustand";

interface UiState {
  islandExpanded: boolean;
  setIslandExpanded: (v: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  islandExpanded: false,
  setIslandExpanded: (islandExpanded) => set({ islandExpanded }),
}));
