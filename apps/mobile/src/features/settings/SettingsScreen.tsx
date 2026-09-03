import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import type { EmailAccount } from "@postbox/email-client/domain";

import { useTheme } from "../../theme";
import { AppText } from "../../components/AppText";
import { GlassView } from "../../components/GlassView";
import { SenderAvatar } from "../../components/SenderAvatar";
import { haptics } from "../../lib/haptics";
import { API_BASE_URL, mailApi } from "../../lib/api";
import {
  areNotificationsEnabled,
  ensureNotificationPermission,
  isNotificationsAvailable,
  setNotificationsEnabled,
} from "../../lib/notifications";
import type { RootStackParamList } from "../../Stack";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen({ navigation }: Props) {
  const { palette, preference: themePreference, setPreference: setThemePreference } = useTheme();
  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notificationsOn, setNotificationsOn] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      (async () => {
        try {
          const data = await mailApi.accounts();
          if (cancelled) return;
          setAccounts(data.accounts);
          setError(null);
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      void areNotificationsEnabled().then((enabled) => {
        if (!cancelled) setNotificationsOn(enabled);
      });

      return () => {
        cancelled = true;
      };
    }, []),
  );

  const syncAll = async () => {
    haptics.impact();
    setSyncing(true);
    try {
      const accountId = accounts[0]?.id ?? 1;
      await mailApi.sync(accountId);
      const data = await mailApi.accounts();
      setAccounts(data.accounts);
      setError(null);
      haptics.success();
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  };

  const toggleNotifications = async () => {    haptics.selection();
    if (!isNotificationsAvailable()) {
      setError("Notifications need a development build — Expo Go can't show them.");
      return;
    }
    if (!notificationsOn) {
      const granted = await ensureNotificationPermission();
      if (!granted) {
        setError("Allow notifications in system settings, then try again.");
        return;
      }
    }
    const next = !notificationsOn;
    await setNotificationsEnabled(next);
    setNotificationsOn(next);
  };

  const connectGmail = async () => {
    haptics.impact();
    try {
      await WebBrowser.openBrowserAsync(`${API_BASE_URL}/api/auth/gmail`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <FlatList
        data={accounts}
        keyExtractor={(account) => String(account.id)}
        ListHeaderComponent={
          <View>
            <View style={styles.sectionHeader}>
              <AppText style={styles.sectionTitle}>Accounts</AppText>
            </View>
            {error ? <AppText style={styles.error}>{error}</AppText> : null}
          </View>
        }
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={styles.spinner} color={palette.primary} />
          ) : (
            <AppText style={styles.empty}>
              No accounts yet. Add one through the backend seed.
            </AppText>
          )
        }
        renderItem={({ item }) => (
           <GlassView style={[styles.row, { backgroundColor: palette.card }]} intensity={0}>
             <SenderAvatar
               sender={{ name: item.displayName ?? undefined, address: item.email }}
               uri={item.picture}
               size={42}
             />
            <View style={styles.rowBody}>
              <AppText style={styles.email}>{item.email}</AppText>
              <AppText style={styles.provider}>
                {item.provider} · {item.displayName ?? "no display name"}
              </AppText>
            </View>
          </GlassView>
        )}
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable
              onPress={() => void connectGmail()}
              style={({ pressed }) => [
                styles.connectButton,
                { borderColor: palette.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText style={styles.connectLabel}>Connect Gmail</AppText>
            </Pressable>

            <Pressable
              onPress={() => void syncAll()}
              disabled={syncing}
              style={({ pressed }) => [
                styles.syncButton,
                { backgroundColor: palette.primary },
                pressed && { opacity: 0.8 },
              ]}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <AppText style={styles.syncLabel}>Sync all</AppText>
              )}
            </Pressable>

            <Pressable
              onPress={() => void toggleNotifications()}
              style={({ pressed }) => [
                styles.toggleRow,
                { borderColor: palette.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText style={styles.toggleLabel}>New mail notifications</AppText>
              <AppText style={[styles.toggleValue, { color: palette.primary }]}>
                {!isNotificationsAvailable() ? "N/A" : notificationsOn ? "On" : "Off"}
              </AppText>
            </Pressable>

            <AppText style={styles.sectionTitle}>Appearance</AppText>
            <View style={styles.themeRow}>
              {(["system", "light", "dark"] as const).map((option) => {
                const selected = themePreference === option;
                return (
                  <Pressable
                    key={option}
                    onPress={() => {
                      haptics.selection();
                      setThemePreference(option);
                    }}
                    style={[
                      styles.themeOption,
                      { borderColor: selected ? palette.primary : palette.border },
                    ]}
                  >
                    <AppText
                      style={[
                        styles.themeOptionLabel,
                        selected && { color: palette.primary, fontWeight: "700" },
                      ]}
                    >
                      {option}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={() => {
                haptics.selection();
                navigation.goBack();
              }}
              style={({ pressed }) => [
                styles.backButton,
                { borderColor: palette.border },
                pressed && { opacity: 0.7 },
              ]}
            >
              <AppText style={styles.backLabel}>Back to inbox</AppText>
            </Pressable>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 20, flexGrow: 1 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  error: { color: "#dc2626", fontSize: 13, marginBottom: 12 },
  spinner: { marginTop: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  rowBody: { flex: 1 },
  email: { fontSize: 15, fontWeight: "600" },
  provider: { fontSize: 13, color: "#71717a", marginTop: 2 },
  empty: { color: "#71717a", fontSize: 14, textAlign: "center", marginTop: 24 },
  footer: { marginTop: 16, gap: 12 },
  connectButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  connectLabel: { fontSize: 14, fontWeight: "600" },
  syncButton: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  syncLabel: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  backButton: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  backLabel: { fontSize: 14, fontWeight: "600" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  toggleValue: { fontSize: 14, fontWeight: "700" },
  themeRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  themeOption: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  themeOptionLabel: { fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
});
