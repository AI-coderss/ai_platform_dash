import { create } from "zustand";

/**
 * UI toggle contract:
 * - Both buttons visible initially.
 * - chooseAvatar(): user pressed "Open Avatar" -> hide the *voice* button only.
 * - chooseVoice(): user opened Voice Assistant -> hide the *avatar* button only.
 * - resetToggles(): show both again (used when voice assistant closes/tears down).
 */
const useUiStore = create((set) => ({
  hideAvatarBtn: false,
  hideVoiceBtn: false,

  chooseAvatar: () =>
    set(() => ({
      hideAvatarBtn: false, // keep avatar button (pressed one) if you want
      hideVoiceBtn: true,   // hide the other one
    })),

  chooseVoice: () =>
    set(() => ({
      hideAvatarBtn: true,  // hide avatar button
      hideVoiceBtn: false,  // keep voice button logic (it auto-hides while open anyway)
    })),

  resetToggles: () =>
    set(() => ({
      hideAvatarBtn: false,
      hideVoiceBtn: false,
    })),
}));

export default useUiStore;
