import { create } from 'zustand';

const useCardStore = create((set) => ({
  activeCardId: null,
  setActiveCardId: (id) => set({ activeCardId: id }),
}));

export default useCardStore;
