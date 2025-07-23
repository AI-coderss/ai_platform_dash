// Zustand store for tracking which card to highlight
import { create } from 'zustand';

const useCardStore = create((set) => ({
  activeCardName: null,
  setActiveCardName: (name) => set({ activeCardName: name }),
}));

export default useCardStore;
