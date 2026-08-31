import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as WebBrowser from "expo-web-browser";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  IconArchive,
  IconArrowBackUp,
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconDots,
  IconMessage,
  IconTrash,
  IconX,
} from "@tabler/icons-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { EmailAttachment, StoredMessage } from "@postbox/email-client/domain";

import { useTheme } from "../../theme";
import { AppText } from "../../components/AppText";
import { GlassView } from "../../components/GlassView";
import { HtmlEmail } from "../../components/HtmlEmail";
import { attachmentUrl, mailApi } from "../../lib/api";
import { haptics } from "../../lib/haptics";
import type { RootStackParamList } from "../../Stack";

type Props = NativeStackScreenProps<RootStackParamList, "Message">;

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatAddresses(addresses?: Array<{ name?: string; address: string }>): string {
  return (addresses ?? [])
    .map((entry) => (entry.name ? `${entry.name} <${entry.address}>` : entry.address))
    .join(", ") || "None";
}

export function MessageScreen({ route, navigation }: Props) {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState<StoredMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<number | null>(null);
  const [actionSheetOpen, setActionSheetOpen] = useState(false);
  const [tagName, setTagName] = useState("Important");
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await mailApi.message(route.params.messageId);
        if (cancelled) return;
        setMessage(data.message);
        setError(null);
        if (!data.message.flags.seen) {
          await mailApi.act(data.message.id, "read").catch(() => undefined);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [route.params.messageId]);

  const shareMessage = useCallback(async () => {
    if (!message) return;
    haptics.impact();
    await Share.share({
      title: message.subject,
      message: message.text ?? message.snippet ?? message.subject,
    }).catch(() => undefined);
  }, [message]);

  const shareAttachment = useCallback(
    async (attachment: EmailAttachment) => {
      if (!message || attachment.id == null) return;
      haptics.impact();
      setSharingId(attachment.id);

      const url = attachmentUrl(message.id, attachment.id);
      const filename = attachment.filename ?? `attachment-${attachment.id}`;
      const fileUri = `${FileSystem.cacheDirectory}${filename}`;

      try {
        const download = await FileSystem.downloadAsync(url, fileUri);

        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(download.uri, {
            mimeType: attachment.contentType ?? "application/octet-stream",
            dialogTitle: filename,
          });
        } else {
          await WebBrowser.openBrowserAsync(url);
        }
      } catch (cause) {
        haptics.error();
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setSharingId(null);
      }
    },
    [message],
  );

  const sender = message?.from[0];
  const attachments = message?.attachments.filter((entry) => !entry.isInline) ?? [];

  const runAction = async (action: string, body?: Record<string, unknown>) => {
    if (!message) return;
    try {
      if (action === "delete" || action === "trash" || action === "move") {
        await mailApi.act(message.id, action);
        navigation.goBack();
        return;
      }
      const result = await mailApi.act(message.id, action, body);
      if (result.message) setMessage(result.message);
      setActionSheetOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}>
      <View style={[styles.topToolbar, { paddingTop: insets.top + 8 }]}>
        <View style={styles.toolbarGroup}>
          <GlassView style={styles.floatingToolbarButton} intensity={90} tint="dark"><Pressable style={styles.toolbarButton} onPress={() => navigation.goBack()} accessibilityLabel="Back">
            <IconArrowBackUp size={22} color={palette.foreground} strokeWidth={2} />
          </Pressable></GlassView>
          <View style={styles.toolbarSpacer} />
          <GlassView style={styles.floatingToolbarButton} intensity={90} tint="dark"><Pressable style={styles.toolbarButton} onPress={() => void runAction("move", { folder: "[Gmail]/All Mail" })} accessibilityLabel="Archive">
            <IconArchive size={21} color={palette.foreground} strokeWidth={2} />
          </Pressable></GlassView>
          <GlassView style={styles.floatingToolbarButton} intensity={90} tint="dark"><Pressable style={styles.toolbarButton} onPress={() => void runAction("trash")} accessibilityLabel="Trash">
            <IconTrash size={21} color={palette.foreground} strokeWidth={2} />
          </Pressable></GlassView>
          <GlassView style={styles.floatingToolbarButton} intensity={90} tint="dark"><Pressable style={styles.toolbarButton} onPress={() => void runAction(message?.flags.seen ? "unread" : "read")} accessibilityLabel="Mark read">
            <IconMessage size={21} color={palette.foreground} strokeWidth={2} />
          </Pressable></GlassView>
          <GlassView style={styles.floatingToolbarButton} intensity={90} tint="dark"><Pressable style={styles.toolbarButton} onPress={() => setActionSheetOpen(true)} accessibilityLabel="More actions">
            <IconDots size={22} color={palette.foreground} strokeWidth={2} />
          </Pressable></GlassView>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
      {loading ? (
        <ActivityIndicator style={styles.spinner} color={palette.primary} />
      ) : error ? (
        <AppText style={styles.error}>{error}</AppText>
      ) : !message ? (
        <AppText style={styles.error}>Message not found.</AppText>
      ) : (
        <>
          <View style={styles.subjectRow}>
            <View style={styles.subjectBlock}>
              <AppText style={styles.subject}>{message.subject}</AppText>
              <Pressable style={styles.senderButton} onPress={() => setDetailsOpen(true)}>
                <AppText style={styles.senderLine}>{sender?.name ?? sender?.address ?? "Unknown"}</AppText>
                <IconChevronDown size={17} color={palette.mutedForeground} strokeWidth={2} />
              </Pressable>
              {message.date ? (
                <AppText style={styles.date}>
                  {new Date(message.date).toLocaleString()}
                </AppText>
              ) : null}
              {message.tags && message.tags.length > 0 ? (
                <View style={styles.tagsRow}>
                  {message.tags.map((tag) => (
                    <View
                      key={tag}
                      style={[styles.tagPill, { backgroundColor: palette.muted }]}
                    >
                      <AppText style={styles.tagText}>{tag}</AppText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </View>

           <Pressable onLongPress={() => setActionSheetOpen(true)} delayLongPress={450}>
           <GlassView style={[styles.bodyCard, { backgroundColor: palette.background }]} intensity={0}>
             <HtmlEmail html={message.html} text={message.text} />
           </GlassView>
           </Pressable>

          {attachments.length > 0 ? (
            <View style={styles.attachmentsSection}>
              <AppText style={styles.attachmentsTitle}>Attachments</AppText>
              {attachments.map((attachment) => (
                <View
                  key={attachment.id}
                     style={[styles.attachmentRow, { backgroundColor: palette.background }]}
                >
                  <View style={styles.attachmentMeta}>
                    <AppText numberOfLines={1} style={styles.attachmentName}>
                      {attachment.filename ?? "attachment"}
                    </AppText>
                    <AppText style={styles.attachmentSize}>
                      {formatBytes(attachment.size)}
                    </AppText>
                  </View>
                  <Pressable
                    onPress={() => void shareAttachment(attachment)}
                    disabled={sharingId === attachment.id}
                    style={({ pressed }) => [
                      styles.shareButton,
                      { backgroundColor: palette.primary },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    {sharingId === attachment.id ? (
                      <ActivityIndicator size="small" color={palette.primaryForeground} />
                    ) : (
                      <AppText style={[styles.shareLabel, { color: palette.primaryForeground }]}>
                        Share
                      </AppText>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
      </ScrollView>
      {message && (
        <View style={[styles.bottomActions, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <View style={styles.bottomActionGroup}>
            <GlassView style={styles.floatingReplyCircle} intensity={90} tint="dark"><Pressable style={styles.replyCircle} onPress={() => navigation.navigate("Compose")} accessibilityLabel="Reply">
              <IconArrowBackUp size={21} color="#f5f5f5" strokeWidth={2} />
            </Pressable></GlassView>
            <GlassView style={styles.floatingReplyPill} intensity={90} tint="dark"><Pressable style={styles.replyPill} onPress={() => navigation.navigate("Compose")}>
              <View style={styles.replyContent}><IconArrowBackUp size={19} color="#f5f5f5" strokeWidth={2} /><AppText style={styles.replyLabel}>Reply all</AppText></View>
            </Pressable></GlassView>
            <GlassView style={styles.floatingReplyPill} intensity={90} tint="dark"><Pressable style={styles.replyPill} onPress={() => navigation.navigate("Compose")}>
              <View style={styles.replyContent}><IconArrowUpRight size={19} color="#f5f5f5" strokeWidth={2} /><AppText style={styles.replyLabel}>Forward</AppText></View>
            </Pressable></GlassView>
            <GlassView style={styles.floatingReplyCircle} intensity={90} tint="dark"><Pressable style={styles.replyCircle} onPress={() => void shareMessage()} accessibilityLabel="Share">
              <IconMessage size={21} color="#f5f5f5" strokeWidth={2} />
            </Pressable></GlassView>
          </View>
        </View>
      )}
      <Modal visible={actionSheetOpen} transparent animationType="slide" onRequestClose={() => setActionSheetOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setActionSheetOpen(false)} />
          <GlassView style={[styles.actionSheet, { backgroundColor: palette.card }]} intensity={0}>
            <AppText style={styles.sheetTitle}>Message actions</AppText>
            <View style={styles.sheetGroup}>
              <Pressable style={styles.sheetRow} onPress={() => void runAction(message?.flags.seen ? "unread" : "read")}>
                <IconCheck size={21} color={palette.foreground} strokeWidth={2} /><AppText style={styles.sheetLabel}>{message?.flags.seen ? "Mark unread" : "Mark read"}</AppText>
              </Pressable>
              <Pressable style={styles.sheetRow} onPress={() => void runAction("trash")}>
                <IconTrash size={21} color={palette.foreground} strokeWidth={2} /><AppText style={styles.sheetLabel}>Move to trash</AppText>
              </Pressable>
              <Pressable style={styles.sheetRow} onPress={() => void runAction("move", { folder: "[Gmail]/All Mail" })}>
                <IconArchive size={21} color={palette.foreground} strokeWidth={2} /><AppText style={styles.sheetLabel}>Move to all mail</AppText>
              </Pressable>
              <Pressable style={styles.sheetRow} onPress={() => void runAction("delete")}>
                <IconX size={21} color={palette.foreground} strokeWidth={2} /><AppText style={styles.sheetLabel}>Move to trash</AppText>
              </Pressable>
              <View style={styles.tagRow}>
                <TextInput value={tagName} onChangeText={setTagName} placeholder="Tag name" placeholderTextColor={palette.mutedForeground} style={[styles.tagInput, { color: palette.foreground, borderColor: palette.border }]} />
                <Pressable style={[styles.tagButton, { backgroundColor: palette.primary }]} onPress={() => void runAction("tag", { tagName })}><AppText style={{ color: palette.primaryForeground }}>Tag</AppText></Pressable>
              </View>
            </View>
          </GlassView>
        </View>
      </Modal>
      <Modal visible={detailsOpen} transparent animationType="fade" onRequestClose={() => setDetailsOpen(false)}>
        <View style={styles.detailsOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setDetailsOpen(false)} />
          <View style={[styles.detailsCard, { backgroundColor: palette.card }]}>
            <AppText style={styles.detailsTitle}>Message details</AppText>
            <AppText style={styles.detailsLine}><AppText style={styles.detailsLabel}>From  </AppText>{formatAddresses(message?.from)}</AppText>
            <AppText style={styles.detailsLine}><AppText style={styles.detailsLabel}>To  </AppText>{formatAddresses(message?.to)}</AppText>
            <AppText style={styles.detailsLine}><AppText style={styles.detailsLabel}>Cc  </AppText>{formatAddresses(message?.cc)}</AppText>
            <AppText style={styles.detailsLine}><AppText style={styles.detailsLabel}>Bcc  </AppText>{formatAddresses(message?.bcc)}</AppText>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 18, paddingTop: 20, paddingBottom: 122 },
  spinner: { marginTop: 48 },
  error: { color: "#dc2626", fontSize: 14, marginTop: 48, textAlign: "center" },
  subjectRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  subjectBlock: { flex: 1 },
  subject: { fontSize: 24, fontWeight: "700", letterSpacing: -0.5, lineHeight: 30 },
  senderButton: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  senderLine: { fontSize: 14, color: "#8e8e93" },
  date: { fontSize: 12, color: "#a1a1aa", marginTop: 2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  tagPill: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: { fontSize: 12, fontWeight: "600" },
  topToolbar: { backgroundColor: "transparent", paddingHorizontal: 12 },
  toolbarGroup: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 },
  toolbarSpacer: { flex: 1 },
  floatingToolbarButton: { width: 42, height: 42, borderRadius: 21, overflow: "hidden" },
  toolbarButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21, backgroundColor: "transparent" },
  toolbarIcon: { fontSize: 25, fontWeight: "600" },
  bodyCard: {
    borderRadius: 0,
    padding: 20,
  },
  attachmentsSection: { marginTop: 20, gap: 8 },
  attachmentsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#71717a",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  attachmentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    padding: 12,
  },
  attachmentMeta: { flex: 1 },
  attachmentName: { fontSize: 14, fontWeight: "600" },
  attachmentSize: { fontSize: 12, color: "#71717a", marginTop: 2 },
  shareButton: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  shareLabel: { fontSize: 13, fontWeight: "700" },
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.5)" },
  actionSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 32, overflow: "hidden" },
  sheetTitle: { fontSize: 22, fontWeight: "700", marginBottom: 12 },
  sheetGroup: { gap: 4 },
  sheetRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14 },
  sheetIcon: { width: 28, fontSize: 23, textAlign: "center" },
  sheetLabel: { fontSize: 16, fontWeight: "500" },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  tagInput: { flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  tagButton: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 11 },
  detailsOverlay: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  detailsCard: { width: "100%", borderRadius: 20, padding: 20 },
  detailsTitle: { fontSize: 19, fontWeight: "600", marginBottom: 14 },
  detailsLine: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  detailsLabel: { color: "#8e8e93", fontWeight: "500" },
  bottomActions: { position: "absolute", right: 0, bottom: 0, left: 0, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "transparent" },
  bottomActionGroup: { flexDirection: "row", alignItems: "center", gap: 8 },
  floatingReplyCircle: { width: 54, height: 54, borderRadius: 27, overflow: "hidden" },
  floatingReplyPill: { flex: 1, height: 54, borderRadius: 27, overflow: "hidden" },
  replyCircle: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  replyPill: { flex: 1, minHeight: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", backgroundColor: "transparent" },
  replyContent: { flexDirection: "row", alignItems: "center", gap: 7 },
  bottomIcon: { color: "#f5f5f5", fontSize: 25 },
  replyLabel: { color: "#f5f5f5", fontSize: 14, fontWeight: "500" },
});
