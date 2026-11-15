import { create } from "zustand";

interface SearchStoreState {
	/** Whether the ⌘/Ctrl+K thread search palette is open. */
	open: boolean;
	setOpen: (open: boolean) => void;
	toggle: () => void;
}

export const useSearchStore = create<SearchStoreState>((set) => ({
	open: false,
	setOpen: (open) => set({ open }),
	toggle: () => set((state) => ({ open: !state.open })),
}));
