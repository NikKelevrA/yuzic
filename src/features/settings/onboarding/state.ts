import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface OnboardingSettingsState {
  hasSeenGetStarted: boolean;
  /**
   * Whether the onboarding discovery opt-in step (E4) has been shown and
   * answered — set true whether the user chose Enable or Not now. This is
   * what makes the step ask-once: it is checked only inside the onboarding
   * flow itself, so an existing user who already finished onboarding never
   * sees it re-appear, and there is no separate "onboarding complete" flag
   * to keep in sync with this one.
   */
  onboardingDiscoveryPrompted: boolean;
}

const initialState: OnboardingSettingsState = {
  hasSeenGetStarted: false,
  onboardingDiscoveryPrompted: false,
};

const onboardingSlice = createSlice({
  name: 'settingsOnboarding',
  initialState,
  reducers: {
    setHasSeenGetStarted(state, action: PayloadAction<boolean>) {
      state.hasSeenGetStarted = action.payload;
    },
    setOnboardingDiscoveryPrompted(state, action: PayloadAction<boolean>) {
      state.onboardingDiscoveryPrompted = action.payload;
    },
  },
});

export const { setHasSeenGetStarted, setOnboardingDiscoveryPrompted } = onboardingSlice.actions;

export default onboardingSlice.reducer;

interface OnboardingRootState {
  settingsOnboarding: OnboardingSettingsState;
}

export const selectHasSeenGetStarted = (state: OnboardingRootState): boolean =>
  state.settingsOnboarding.hasSeenGetStarted;

export const selectOnboardingDiscoveryPrompted = (state: OnboardingRootState): boolean =>
  state.settingsOnboarding.onboardingDiscoveryPrompted;
