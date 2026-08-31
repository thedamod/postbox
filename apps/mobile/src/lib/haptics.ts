import * as Haptics from "expo-haptics";

function run(action: () => void): void {
  try {
    action();
  } catch {
    // Haptics are best-effort: never crash on unsupported devices.
  }
}

export const haptics = {
  impact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light): void {
    run(() => void Haptics.impactAsync(style));
  },
  selection(): void {
    run(() => void Haptics.selectionAsync());
  },
  success(): void {
    run(() =>
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  },
  warning(): void {
    run(() =>
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    );
  },
  error(): void {
    run(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
  },
};
