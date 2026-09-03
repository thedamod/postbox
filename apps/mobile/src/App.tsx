import { NavigationContainer, type Theme } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { StyleSheet, View, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { dark, light } from "@postbox/ui/tokens";

import { appFonts, useAppFonts } from "./fonts";
import { setupBackgroundMailSync } from "./lib/background-sync";
import {
  areNotificationsEnabled,
  ensureNotificationPermission,
  installNotificationHandler,
} from "./lib/notifications";
import { RootStack } from "./Stack";

function navigationTheme(scheme: "light" | "dark"): Theme {
  const palette = scheme === "dark" ? dark : light;

  return {
    dark: scheme === "dark",
    colors: {
      primary: palette.primary,
      background: palette.background,
       card: palette.background,
      text: palette.foreground,
      border: palette.border,
      notification: palette.primary,
    },
    fonts: {
      regular: { fontFamily: appFonts.regular, fontWeight: "400" },
      medium: { fontFamily: appFonts.medium, fontWeight: "500" },
      bold: { fontFamily: appFonts.bold, fontWeight: "700" },
      heavy: { fontFamily: appFonts.bold, fontWeight: "800" },
    },
  };
}

export default function App() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const fontsLoaded = useAppFonts();

  // Local-notification presentation, background mail sync (~15 min), and a
  // first-launch permission prompt when notifications are enabled. All native
  // modules load lazily so the app also runs inside Expo Go.
  useEffect(() => {
    installNotificationHandler();
    void setupBackgroundMailSync();
    void areNotificationsEnabled().then((enabled) => {
      if (enabled) void ensureNotificationPermission();
    });
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        {fontsLoaded ? (
          <NavigationContainer theme={navigationTheme(scheme)}>
            <RootStack />
          </NavigationContainer>
        ) : (
          <View style={[styles.root, { backgroundColor: scheme === "dark" ? dark.background : light.background }]} />
        )}
        <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
