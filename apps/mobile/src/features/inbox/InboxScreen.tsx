import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Animated,
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as WebBrowser from "expo-web-browser";
import {
  IconEdit,
  IconFileText,
  IconFolder,
  IconInbox,
  IconMenu2,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSend,
  IconSettings,
  IconTag,
  IconTrash,
  IconX,
  type Icon,
} from "@tabler/icons-react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Address, EmailAccount, StoredMessage, StoredThread } from "@postbox/email-client/domain";

import { useTheme } from "../../theme";
import { AppText } from "../../components/AppText";
import { GlassView } from "../../components/GlassView";
import { SenderAvatar } from "../../components/SenderAvatar";
import { API_BASE_URL, mailApi, reauthAccountId } from "../../lib/api";
import { haptics } from "../../lib/haptics";
import {
  addNotificationTapListener,
  getLastNotifiedId,
  notifyNewMail,
  setLastNotifiedId,
  unseenPreviews,
} from "../../lib/notifications";
import type { RootStackParamList } from "../../Stack";

type Props = NativeStackScreenProps<RootStackParamList, "Inbox">;
type MailIconName = string;

const TABLER_ICONS: Record<string, Icon> = {
  menu: IconMenu2,
  magnify: IconSearch,
  close: IconX,
  "pencil-outline": IconEdit,
  "inbox-outline": IconInbox,
  "trash-can-outline": IconTrash,
  "send-outline": IconSend,
  "file-document-outline": IconFileText,
  "folder-outline": IconFolder,
  "tag-outline": IconTag,
  sync: IconRefresh,
  "cog-outline": IconSettings,
  plus: IconPlus,
};

function MailIcon({ name, size = 24, color }: { name: MailIconName; size?: number; color: string }) {
  const TablerIcon = TABLER_ICONS[name];
  return TablerIcon ? <TablerIcon size={size} color={color} strokeWidth={2} /> : null;
}

type FolderItem = { key: string; name: string; path: string | null };

const FOLDERS: FolderItem[] = [
  { key: "inbox", name: "Inbox", path: "INBOX" },
  { key: "trash", name: "Trash", path: "[Gmail]/Trash" },
  { key: "sent", name: "Sent", path: "[Gmail]/Sent Mail" },
  { key: "drafts", name: "Drafts", path: "[Gmail]/Drafts" },
];

const FOLDER_ICONS: Record<string, MailIconName> = {
  inbox: "inbox-outline",
  trash: "trash-can-outline",
  sent: "send-outline",
  drafts: "file-document-outline",
};

type TagItem = { id: number; name: string; color: string | null };

type Row = {
  id: number;
  sender?: Address;
  subject: string;
  snippet?: string | null;
  date?: string | null;
  unread: boolean;
};

export function InboxScreen({ navigation }: Props) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();

  const [accounts, setAccounts] = useState<EmailAccount[]>([]);
  const [accountId, setAccountId] = useState<number>(1);
  const [folder, setFolder] = useState<string | null>("INBOX");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Account whose OAuth grant died (backend 401 reauth_required).
  const [deadGrantAccountId, setDeadGrantAccountId] = useState<number | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tags, setTags] = useState<TagItem[]>([]);
  const drawerOffset = useRef(new Animated.Value(-380)).current;
  const pickerOffset = useRef(new Animated.Value(1)).current;
  const pickerBackdropOpacity = useRef(new Animated.Value(0)).current;

  const openSidebar = () => {
    setDrawerMounted(true);
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    Animated.timing(drawerOffset, { toValue: -380, duration: 180, useNativeDriver: true }).start(() => {
      setSidebarOpen(false);
      setDrawerMounted(false);
    });
  };

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const searchRequest = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResumeSync = useRef(0);
  // Message ids already surfaced as notifications this session.
  const notifiedIds = useRef<Set<number>>(new Set());

  const PAGE_SIZE = 50;

  const toRows = useCallback((threads: StoredThread[]): Row[] => {
    return threads.map((thread) => ({
      id: thread.id,
      sender: thread.lastFrom?.[0],
      subject: thread.subject,
      snippet: thread.snippet,
      date: thread.lastMessageAt,
      unread: (thread.unreadCount ?? 0) > 0,
    }));
  }, []);

  const toSearchRows = useCallback((messages: StoredMessage[]): Row[] => {
    return messages.map((message) => ({
      id: message.id,
      sender: message.from[0],
      subject: message.subject,
      snippet: message.snippet,
      date: message.date,
      unread: !message.flags.seen,
    }));
  }, []);

  const load = useCallback(
    async (account = accountId, selectedFolder = folder) => {
      try {
        const knownAccounts = accounts.length > 0 ? accounts : (await mailApi.accounts()).accounts;
        setAccounts(knownAccounts);
        const active = knownAccounts.find((acc) => acc.id === account)?.id ?? knownAccounts[0]?.id ?? account;
        setAccountId(active);

        mailApi
          .tags(active)
          .then((data) => setTags(data.tags))
          .catch(() => undefined);

        const data = await mailApi.threads(active, {
          limit: PAGE_SIZE,
          offset: 0,
          folder: selectedFolder ?? undefined,
        });
        setRows(toRows(data.threads));
        setHasMore(data.hasMore);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setLoading(false);
      }
    },
    [accountId, accounts, folder, toRows],
  );

  const loadMore = useCallback(async () => {    if (loadingMore || !hasMore || rows.length === 0 || searching) return;
    setLoadingMore(true);
    try {
      await mailApi.syncMore(accountId, folder);

      const data = await mailApi.threads(accountId, {
        limit: PAGE_SIZE,
        offset: rows.length,
        folder: folder ?? undefined,
      });

      setRows((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...toRows(data.threads).filter((row) => !seen.has(row.id))];
      });
      setHasMore(data.hasMore);
      setDeadGrantAccountId(null);
    } catch (cause) {
      const reauthId = reauthAccountId(cause);
      if (reauthId != null) {
        setDeadGrantAccountId(reauthId === -1 ? accountId : reauthId);
        setError(null);
      } else {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, rows.length, searching, accountId, folder, toRows]);

  const syncNow = async (accountArg = accountId, folderArg = folder, opts?: { notify?: boolean }) => {
    haptics.impact();
    setSyncing(true);
    try {
      await load(accountArg, folderArg);
      try {
        const { result } = await mailApi.sync(accountArg, folderArg);
        await load(accountArg, folderArg);
        haptics.success();
        setDeadGrantAccountId(null);
        // Fresh-arrival previews drive notifications. Only the inbox pages
        // the user — Sent/Drafts/Trash arrivals (e.g. our own sends) stay
        // silent. Manual refreshes advance the watermark without buzzing;
        // only background/resume syncs notify.
        if (result?.changed) {
          const arrivals = (result.folders ?? [])
            .filter((entry) => entry.path === "INBOX")
            .flatMap((entry) => entry.previews ?? []);
          if (arrivals.length > 0) {
            const lastNotified = await getLastNotifiedId(accountArg);
            const fresh = unseenPreviews(arrivals, lastNotified, notifiedIds.current);
            for (const preview of fresh) notifiedIds.current.add(preview.messageId);
            if (fresh.length > 0) {
              const maxId = Math.max(...fresh.map((preview) => preview.messageId));
              await setLastNotifiedId(accountArg, maxId);
              if (opts?.notify) await notifyNewMail(accountArg, fresh);
            }
          }
        }
      } catch (cause) {
        const reauthId = reauthAccountId(cause);
        if (reauthId != null) {
          // Dead grant: prompt a reconnect instead of a generic sync error.
          setDeadGrantAccountId(reauthId === -1 ? accountArg : reauthId);
          setError(null);
        } else {
          haptics.error();
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      } finally {
        setSyncing(false);
      }
      return;
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active" || Date.now() - lastResumeSync.current < 120_000) return;
      lastResumeSync.current = Date.now();
      void syncNow(accountId, folder, { notify: true });
    });

    return () => subscription.remove();
  }, [accountId, folder]);

  // Notification taps deep-link into the conversation.
  useEffect(() => {
    const listener = addNotificationTapListener(({ messageId }) => {
      navigation.navigate("Message", { messageId });
    });
    return () => listener.remove();
  }, [navigation]);

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, []);

  const reconnectGmail = async () => {
    haptics.impact();
    try {
      await WebBrowser.openBrowserAsync(`${API_BASE_URL}/api/auth/gmail`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const switchAccount = (id: number) => {
    haptics.selection();
    closePicker();
    closeSidebar();
    setFolder("INBOX");
    setAccountId(id);
    setLoading(true);
    void syncNow(id, "INBOX");
  };

  const selectFolder = (path: string | null) => {
    haptics.selection();
    closeSidebar();
    setFolder(path);
    setLoading(true);
    void syncNow(accountId, path);
  };

  const closePicker = () => {
    Animated.parallel([
      Animated.timing(pickerOffset, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(pickerBackdropOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => setPickerOpen(false));
  };

  const runSearch = useCallback(
    async (text: string) => {
      const requestId = ++searchRequest.current;
      const trimmed = text.trim();
      setQuery(text);
      if (!trimmed) {
        setSearching(false);
        await load(accountId, folder);
        return;
      }
      setSearching(true);
      try {
        const { messages } = await mailApi.search(accountId, trimmed);
        if (requestId !== searchRequest.current) return;
        setRows(toSearchRows(messages));
        setHasMore(false);
        setError(null);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSearching(false);
      }
    },
    [accountId, folder, load, toSearchRows],
  );

  useFocusEffect(
    useCallback(() => {
      if (query.trim()) {
        void runSearch(query);
      } else {
        void load();
      }
    }, [load, runSearch, query]),
  );

  const activeAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? accounts[0],
    [accounts, accountId],
  );

  const folderLabel = useMemo(
    () => FOLDERS.find((item) => item.path === folder)?.name ?? "Inbox",
    [folder],
  );

  useEffect(() => {
    if (!sidebarOpen) return;
    Animated.spring(drawerOffset, {
      toValue: 0,
      useNativeDriver: true,
      damping: 24,
      stiffness: 240,
    }).start();
  }, [drawerOffset, sidebarOpen]);

  useEffect(() => {
    if (!pickerOpen) return;

    pickerOffset.setValue(1);
    pickerBackdropOpacity.setValue(0);
    Animated.parallel([
      Animated.spring(pickerOffset, {
        toValue: 0,
        useNativeDriver: true,
        damping: 25,
        stiffness: 260,
        mass: 0.8,
      }),
      Animated.timing(pickerBackdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [pickerBackdropOpacity, pickerOffset, pickerOpen]);

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
       <View style={[styles.header, { backgroundColor: palette.background, paddingTop: insets.top + 8 }]}> 
        <GlassView style={styles.floatingHeaderButton} intensity={90} tint="dark"><Pressable
          onPress={() => {
            haptics.selection();
             openSidebar();
          }}
          style={({ pressed }) => [
             styles.iconButton,
              { backgroundColor: "transparent" },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Open menu"
        >
           <MailIcon name="menu" size={24} color={palette.foreground} />
        </Pressable></GlassView>

          <GlassView style={styles.floatingSearch} intensity={90} tint="dark"><View style={styles.searchBox}> 
           <MailIcon name="magnify" size={19} color={palette.mutedForeground} />
          <TextInput
            value={query}
           onChangeText={(text) => {
             setQuery(text);
             if (searchTimer.current) clearTimeout(searchTimer.current);
             searchTimer.current = setTimeout(() => void runSearch(text), 260);
           }}
            placeholder={`Search ${folderLabel}`}
            placeholderTextColor={palette.mutedForeground}
            style={[styles.searchInput, { color: palette.foreground }]}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 && (
             <Pressable
              onPress={() => void runSearch("")}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
              accessibilityLabel="Clear search"
            >
                <MailIcon name="close" size={17} color={palette.mutedForeground} />
            </Pressable>
          )}
        </View></GlassView>

        <GlassView style={styles.floatingHeaderButton} intensity={90} tint="dark"><Pressable
          onPress={() => {
            haptics.selection();
            setPickerOpen(true);
          }}
          style={({ pressed }) => [
            styles.iconButton,
             { backgroundColor: "transparent" },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityLabel="Switch account"
        >
          <SenderAvatar
           sender={
              activeAccount
                ? { name: activeAccount.displayName ?? undefined, address: activeAccount.email }
                : undefined
           }
            uri={activeAccount?.picture}
            index={0}
            size={28}
          />
        </Pressable></GlassView>
       </View>

      {deadGrantAccountId != null ? (
        <View style={[styles.reauthBox, { borderColor: palette.primary }]}>
          <AppText style={styles.reauthText}>
            Gmail disconnected — reconnect to keep syncing.
          </AppText>
          <View style={styles.reauthActions}>
            <Pressable
              onPress={() => void reconnectGmail()}
              style={[styles.reauthButton, { backgroundColor: palette.primary }]}
            >
              <AppText style={styles.reauthButtonLabel}>Reconnect</AppText>
            </Pressable>
            <Pressable
              onPress={() => setDeadGrantAccountId(null)}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <AppText style={styles.reauthDismiss}>Dismiss</AppText>
            </Pressable>
          </View>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <AppText style={styles.errorText}>Can't reach the backend: {error}</AppText>
        </View>
      ) : null}

      <FlatList
        data={rows}
        keyExtractor={(row) => String(row.id)}
        contentContainerStyle={styles.list}
        refreshing={syncing}
        onRefresh={() => void syncNow()}
        onEndReachedThreshold={0.4}
        onEndReached={() => void loadMore()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          loading || searching ? (
            <ActivityIndicator style={styles.spinner} color={palette.primary} />
          ) : (
            <AppText style={styles.empty}>No conversations. Sync an account.</AppText>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footerSpinner} color={palette.primary} />
          ) : hasMore ? (
            <AppText style={styles.footerHint}>Sync & scroll for more</AppText>
          ) : null
        }
        renderItem={({ item, index }) => {
          return (
            <Pressable
              onPress={() => {
                haptics.selection();
                navigation.navigate("Message", { messageId: item.id });
              }}
              style={({ pressed }) => [
                 styles.row,
                  { backgroundColor: palette.background },
                 pressed && { backgroundColor: palette.muted },
              ]}
            >
              <SenderAvatar sender={item.sender} index={index} size={44} />

              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <AppText
                    numberOfLines={1}
                    style={[styles.sender, item.unread && styles.unread]}
                  >
                    {item.sender?.name || item.sender?.address || "Unknown"}
                  </AppText>
                  <AppText style={styles.time}>
                    {item.date
                      ? new Date(item.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : ""}
                  </AppText>
                </View>
                <AppText numberOfLines={1} style={styles.subject}>
                  {item.subject}
                </AppText>
                <AppText numberOfLines={2} style={styles.snippet}>
                  {item.snippet ?? "No preview"}
                </AppText>
                {item.unread && (
                  <View style={[styles.dot, { backgroundColor: palette.primary }]} />
                )}
              </View>
            </Pressable>
          );
        }}
      />

           <Pressable
        onPress={() => {
          haptics.impact();
          navigation.navigate("Compose");
        }}
        style={({ pressed }) => [
          styles.fab,
           { backgroundColor: "rgba(255,255,255,0.12)", borderColor: "rgba(255,255,255,0.12)", borderWidth: 1 },
          pressed && { opacity: 0.85 },
        ]}
      >
         <MailIcon name="pencil-outline" size={21} color={palette.foreground} />
      </Pressable>

      {drawerMounted ? (
        <View style={styles.overlay}>
          <Pressable style={styles.backdrop} onPress={closeSidebar} />
            <Animated.View style={[styles.sidebar, { backgroundColor: palette.background, paddingTop: insets.top + 12, transform: [{ translateX: drawerOffset }] }]}> 
            <View style={styles.sidebarHeader}>
              <View>
                <AppText style={styles.sidebarTitle}>Mail</AppText>
                <AppText style={styles.sidebarSubtitle}>
                  {activeAccount?.displayName ?? activeAccount?.email ?? "No account"}
                </AppText>
              </View>
              <Pressable
                 onPress={closeSidebar}
                hitSlop={10}
                style={({ pressed }) => pressed && { opacity: 0.6 }}
                accessibilityLabel="Close menu"
              >
                 <MailIcon name="close" size={21} color={palette.foreground} />
              </Pressable>
              </View>

            <AppText style={styles.sectionLabel}>Folders</AppText>
            {FOLDERS.map((item) => {
              const active = item.path === folder;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => selectFolder(item.path)}
                  style={({ pressed }) => [
                    styles.sidebarItem,
                    active && { backgroundColor: palette.accent },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <MailIcon name={FOLDER_ICONS[item.key] ?? "folder-outline"} size={21} color={palette.foreground} />
                  <AppText style={[styles.sidebarItemText, active && styles.sidebarItemActive]}>
                    {item.name}
                  </AppText>
                </Pressable>
              );
            })}

            {tags.length > 0 ? (
              <>
                <AppText style={styles.sectionLabel}>Tags</AppText>
                {tags.map((tag) => (
                  <Pressable
                    key={tag.id}
                    onPress={() => {
                      haptics.selection();
                       closeSidebar();
                      void runSearch(tag.name);
                    }}
                    style={({ pressed }) => [
                      styles.sidebarItem,
                      pressed && { opacity: 0.7 },
                    ]}
                    >
                    <MailIcon name="tag-outline" size={20} color={palette.mutedForeground} />
                    <View
                      style={[styles.tagDot, { backgroundColor: tag.color ?? palette.primary }]}
                    />
                    <AppText style={styles.sidebarItemText}>{tag.name}</AppText>
                  </Pressable>
                ))}
              </>
            ) : null}

            <View style={styles.sidebarSpacer} />

            <Pressable
              onPress={() => {
                haptics.selection();
                 closeSidebar();
                void syncNow();
              }}
              style={({ pressed }) => [styles.sidebarItem, pressed && { opacity: 0.7 }]}
              >
                <MailIcon name="sync" size={21} color={palette.foreground} />
                <AppText style={styles.sidebarItemText}>
                {syncing ? "Syncing…" : "Sync now"}
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                haptics.selection();
                 closeSidebar();
                navigation.navigate("Settings");
              }}
              style={({ pressed }) => [styles.sidebarItem, pressed && { opacity: 0.7 }]}
              >
                <MailIcon name="cog-outline" size={21} color={palette.foreground} />
                <AppText style={styles.sidebarItemText}>Settings</AppText>
            </Pressable>
            </Animated.View>
        </View>
      ) : null}

      {pickerOpen ? (
        <View style={styles.overlay}>
          <Animated.View style={[styles.backdrop, { opacity: pickerBackdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          </Animated.View>
          <Animated.View
            style={[
              styles.picker,
              {
                backgroundColor: palette.card,
                paddingBottom: insets.bottom + 16,
                transform: [
                  {
                    translateY: pickerOffset.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 420],
                    }),
                  },
                ],
              },
            ]}
          >
            <AppText style={styles.pickerTitle}>Switch account</AppText>
            {accounts.length === 0 ? (
              <AppText style={styles.pickerEmpty}>No accounts found.</AppText>
            ) : (
              accounts.map((account, index) => {
                const active = account.id === accountId;
                return (
                  <Pressable
                    key={account.id}
                    onPress={() => switchAccount(account.id)}
                    style={({ pressed }) => [
                      styles.pickerItem,
                      active && { backgroundColor: palette.accent },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <SenderAvatar
                      sender={{ name: account.displayName ?? undefined, address: account.email }}
                      uri={account.picture}
                      index={index}
                      size={34}
                    />
                    <View style={styles.pickerBody}>
                      <AppText numberOfLines={1} style={styles.pickerName}>
                        {account.displayName ?? account.email}
                      </AppText>
                      <AppText numberOfLines={1} style={styles.pickerEmail}>
                        {account.email}
                      </AppText>
                    </View>
                    {active && <AppText style={styles.pickerCheck}>✓</AppText>}
                  </Pressable>
                );
              })
            )}
            <Pressable
              onPress={() => {
                closePicker();
                navigation.navigate("Settings");
              }}
              style={({ pressed }) => [styles.pickerAdd, pressed && { opacity: 0.7 }]}
            >
               <View style={styles.pickerAddContent}>
                 <MailIcon name="plus" size={23} color={palette.primary} />
                 <AppText style={[styles.pickerAddText, { color: palette.primary }]}>Add account</AppText>
               </View>
            </Pressable>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  floatingHeaderButton: { width: 46, height: 46, borderRadius: 23, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  floatingSearch: { flex: 1, height: 46, borderRadius: 23, overflow: "hidden" },
  iconButton: {
    width: 46,
    height: 46,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconGlyph: { fontSize: 17, fontWeight: "600" },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    borderRadius: 23,
    paddingHorizontal: 14,
    gap: 7,
    backgroundColor: "transparent",
  },
  searchGlyph: { fontSize: 13 },
  searchInput: { flex: 1, fontSize: 14, padding: 0, fontFamily: "DMSans-Regular" },
  searchClear: { fontSize: 13, fontWeight: "600" },
  errorBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(220, 38, 38, 0.1)",
  },
  errorText: { color: "#dc2626", fontSize: 12 },
  reauthBox: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  reauthText: { fontSize: 13, fontWeight: "600" },
  reauthActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  reauthButton: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  reauthButtonLabel: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  reauthDismiss: { fontSize: 13, color: "#71717a" },
  list: { paddingHorizontal: 16, paddingBottom: 96, flexGrow: 1 },
  spinner: { marginTop: 32 },
  empty: { color: "#71717a", fontSize: 14, textAlign: "center", marginTop: 32 },
  footerSpinner: { paddingVertical: 16 },
  footerHint: {
    color: "#71717a",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  sender: { fontSize: 15, fontWeight: "400", flexShrink: 1 },
  unread: { fontWeight: "700" },
  time: { fontSize: 12, color: "#a1a1aa" },
  subject: { fontSize: 14, color: "#52525b", marginTop: 2 },
  snippet: { fontSize: 13, color: "#71717a", marginTop: 2 },
  dot: {
    position: "absolute",
    right: 0,
    top: 14,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  fabLabel: { fontSize: 24, fontWeight: "700" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    zIndex: 10,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sidebar: {
    width: "84%",
    maxWidth: 360,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  sidebarHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sidebarTitle: { fontSize: 22, fontWeight: "700", letterSpacing: -0.5 },
  sidebarSubtitle: { fontSize: 12, color: "#71717a", marginTop: 2 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: 18,
    marginBottom: 4,
  },
  sidebarItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  sidebarItemText: { fontSize: 15, fontWeight: "500" },
  sidebarItemActive: { fontWeight: "700" },
  tagDot: { width: 10, height: 10, borderRadius: 5 },
  sidebarSpacer: { flex: 1 },
  picker: {
    position: "absolute",
    right: 0,
    bottom: 0,
    left: 0,
    width: "100%",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 30,
    alignSelf: "flex-end",
  },
  pickerTitle: { fontSize: 18, fontWeight: "700", marginBottom: 12 },
  pickerEmpty: { color: "#71717a", fontSize: 14, paddingVertical: 8 },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  pickerBody: { flex: 1 },
  pickerName: { fontSize: 15, fontWeight: "600" },
  pickerEmail: { fontSize: 12, color: "#71717a", marginTop: 1 },
  pickerCheck: { fontSize: 15, fontWeight: "700" },
  pickerAdd: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#e4e4e7",
  },
  pickerAddContent: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  pickerAddText: { fontSize: 15, fontWeight: "600" },
});
