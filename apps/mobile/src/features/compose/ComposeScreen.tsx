import { useEffect, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { IconArrowUp, IconChevronDown, IconUserCircle } from "@tabler/icons-react-native";
import { IconArrowBackUp, IconDots, IconLink } from "@tabler/icons-react-native";

import { AppText } from "../../components/AppText";
import { GlassView } from "../../components/GlassView";
import { haptics } from "../../lib/haptics";
import { mailApi } from "../../lib/api";
import { useTheme } from "../../theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { RootStackParamList } from "../../Stack";

type Props = NativeStackScreenProps<RootStackParamList, "Compose">;

type PendingAttachment = {
  id: string;
  filename: string;
  contentType?: string;
  contentBase64: string;
  size?: number;
  isImage: boolean;
  uri?: string;
};

function formatBytes(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ComposeScreen({ navigation }: Props) {
  const { palette, fonts } = useTheme();
  const insets = useSafeAreaInsets();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Array<{ id: number; email: string; displayName?: string | null }>>([]);
  const [contacts, setContacts] = useState<Array<{ name: string; email: string; picture?: string }>>([]);
  const [toFocused, setToFocused] = useState(false);
  const [fromFocused, setFromFocused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    mailApi
      .accounts()
       .then(({ accounts: loadedAccounts }) => {
         if (!cancelled) {
           setAccounts(loadedAccounts);
           setAccountId(loadedAccounts[0]?.id ?? null);
           if (loadedAccounts[0]) {
             mailApi.contacts(loadedAccounts[0].id).then(({ contacts: loadedContacts }) => {
               if (!cancelled) setContacts(loadedContacts);
             }).catch(() => undefined);
           }
         }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const attachImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError("Photo library permission is required to attach images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      base64: true,
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) return;

    haptics.selection();
    setAttachments((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${asset.fileName ?? "image"}`,
        filename: asset.fileName ?? `image-${Date.now()}.jpg`,
        contentType: asset.mimeType ?? "image/jpeg",
        contentBase64: asset.base64 as string,
        size: asset.fileSize,
        isImage: true,
        uri: asset.uri,
      },
    ]);
  };

  const attachFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: "*/*",
    });

    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];

    try {
      const contentBase64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      haptics.selection();
      setAttachments((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${asset.name}`,
          filename: asset.name,
          contentType: asset.mimeType ?? "application/octet-stream",
          contentBase64,
          size: asset.size,
          isImage: false,
          uri: asset.uri,
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const removeAttachment = (id: string) => {
    haptics.selection();
    setAttachments((prev) => prev.filter((entry) => entry.id !== id));
  };

  const send = async () => {
    const recipients = to.split(",").map((entry) => entry.trim()).filter(Boolean);

    if (recipients.length === 0 || !subject.trim()) {
      setError("To and Subject are required.");
      haptics.warning();
      return;
    }

    setSending(true);
    setError(null);
    try {
      await mailApi.compose({
        accountId: accountId ?? 1,
        to: recipients,
        subject: subject.trim(),
        text: body,
        attachments: attachments.map(({ filename, contentType, contentBase64 }) => ({
          filename,
          contentType,
          contentBase64,
        })),
      });
      haptics.success();
      navigation.goBack();
    } catch (cause) {
      haptics.error();
      setError(cause instanceof Error ? cause.message : String(cause));
      setSending(false);
    }
  };

  const inputColor = palette.foreground;

  return (
    <View style={[styles.container, { backgroundColor: palette.background }]}> 
      <View style={[styles.composeToolbar, { paddingTop: insets.top + 8 }]}> 
        <Pressable style={styles.toolbarButton} onPress={() => navigation.goBack()} accessibilityLabel="Back">
          <IconArrowBackUp size={23} color={palette.foreground} strokeWidth={2} />
        </Pressable>
        <View style={styles.toolbarSpacer} />
        <Pressable style={styles.toolbarButton} onPress={() => Alert.alert("Add attachment", "Choose an attachment type", [
          { text: "Image", onPress: () => void attachImage() },
          { text: "File", onPress: () => void attachFile() },
          { text: "Cancel", style: "cancel" },
        ])} accessibilityLabel="Add attachment">
          <IconLink size={22} color={palette.foreground} strokeWidth={2} />
        </Pressable>
        <Pressable style={styles.toolbarButton} onPress={() => void send()} disabled={sending} accessibilityLabel="Send">
          <IconArrowUp size={23} color={palette.foreground} strokeWidth={2} />
        </Pressable>
        <Pressable style={styles.toolbarButton} onPress={() => void attachFile()} accessibilityLabel="More actions">
          <IconDots size={23} color={palette.foreground} strokeWidth={2} />
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
      {error ? (
        <AppText style={[styles.error, { color: palette.destructive }]}>{error}</AppText>
      ) : null}

      <View style={styles.fieldGroup}>
        <Pressable onPress={() => setFromFocused((value) => !value)} style={[styles.fromRow, { borderBottomColor: palette.border }]}> 
          <AppText style={styles.fieldLabel}>From</AppText>
          <AppText numberOfLines={1} style={styles.fromValue}>
            {accounts.find((account) => account.id === accountId)?.email ?? "No account"}
          </AppText>
          <IconChevronDown size={18} color={palette.mutedForeground} strokeWidth={2} />
        </Pressable>
        {fromFocused ? (
          <View style={[styles.suggestions, { backgroundColor: palette.muted, borderColor: palette.border }]}>
            {accounts.map((account) => (
              <Pressable key={account.id} style={styles.suggestionRow} onPress={() => { setAccountId(account.id); setFromFocused(false); }}>
                <IconUserCircle size={20} color={palette.mutedForeground} strokeWidth={2} />
                <View style={styles.suggestionText}><AppText>{account.displayName ?? account.email}</AppText><AppText style={styles.suggestionEmail}>{account.email}</AppText></View>
              </Pressable>
            ))}
          </View>
        ) : null}
        <TextInput
          value={to}
          onChangeText={setTo}
          onFocus={() => setToFocused(true)}
          onBlur={() => setTimeout(() => setToFocused(false), 160)}
          placeholder="To"
          placeholderTextColor={palette.mutedForeground}
          autoCapitalize="none"
          keyboardType="email-address"
          style={[styles.recipientInput, { color: inputColor, borderColor: palette.border, fontFamily: fonts.regular }]}
        />
        {toFocused && contacts.length > 0 ? (
          <View style={[styles.suggestions, { backgroundColor: palette.muted, borderColor: palette.border }]}>
            {contacts
              .filter((contact) => `${contact.name} ${contact.email}`.toLowerCase().includes(to.toLowerCase()))
              .map((contact) => (
                <Pressable key={contact.email} style={styles.suggestionRow} onPress={() => { setTo(contact.email); setToFocused(false); }}>
                  <IconUserCircle size={20} color={palette.mutedForeground} strokeWidth={2} />
                  <View style={styles.suggestionText}>
                    <AppText>{contact.name}</AppText>
                    <AppText style={styles.suggestionEmail}>{contact.email}</AppText>
                  </View>
                </Pressable>
              ))}
          </View>
        ) : null}
      </View>

      <TextInput
        value={subject}
        onChangeText={setSubject}
        placeholder="Subject"
        placeholderTextColor={palette.mutedForeground}
           style={[
           styles.lineInput,
          { color: inputColor, borderColor: palette.border, fontFamily: fonts.regular },
        ]}
      />

      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder="Write your message…"
        placeholderTextColor={palette.mutedForeground}
        multiline
        style={[
           styles.bodyInput,
          styles.body,
          { color: inputColor, borderColor: palette.border, fontFamily: fonts.regular },
        ]}
      />

      {attachments.length > 0 ? (
        <View style={styles.attachments}>
          {attachments.map((attachment) => (
            <GlassView
              key={attachment.id}
              intensity={30}
              style={styles.attachmentChip}
            >
              {attachment.isImage && attachment.uri ? (
                <Image source={{ uri: attachment.uri }} style={styles.thumbnail} />
              ) : null}
              <View style={styles.attachmentMeta}>
                <AppText numberOfLines={1} style={styles.attachmentName}>
                  {attachment.filename}
                </AppText>
                <AppText style={styles.attachmentSize}>
                  {formatBytes(attachment.size)}
                </AppText>
              </View>
              <Pressable onPress={() => removeAttachment(attachment.id)} hitSlop={8}>
                <AppText style={styles.remove}>✕</AppText>
              </Pressable>
            </GlassView>
          ))}
        </View>
      ) : null}

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 28 },
  composeToolbar: { position: "absolute", top: 0, right: 0, left: 0, zIndex: 2, flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingBottom: 10, backgroundColor: "#0a0a0a" },
  toolbarButton: { width: 42, height: 42, alignItems: "center", justifyContent: "center", borderRadius: 21 },
  toolbarSpacer: { flex: 1 },
  fieldGroup: { gap: 8 },
  fromRow: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, paddingHorizontal: 4 },
  fieldLabel: { fontSize: 15, color: "#8e8e93", width: 48 },
  fromValue: { flex: 1, fontSize: 15 },
  suggestions: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  suggestionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  suggestionText: { flex: 1 },
  suggestionEmail: { color: "#8e8e93", fontSize: 12, marginTop: 2 },
  error: { fontSize: 13 },
  recipientInput: { borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, minHeight: 58, paddingHorizontal: 4, paddingVertical: 14, fontSize: 17 },
  lineInput: { borderWidth: 0, borderBottomWidth: 1, borderRadius: 0, minHeight: 64, paddingHorizontal: 4, paddingVertical: 14, fontSize: 17 },
  bodyInput: { borderWidth: 0, borderRadius: 0, minHeight: 280, paddingHorizontal: 4, paddingVertical: 18, fontSize: 17 },
  body: { textAlignVertical: "top" },
  attachments: { gap: 8 },
  attachmentChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 8,
  },
  thumbnail: { width: 40, height: 40, borderRadius: 8 },
  attachmentMeta: { flex: 1 },
  attachmentName: { fontSize: 14, fontWeight: "600" },
  attachmentSize: { fontSize: 12, color: "#71717a", marginTop: 2 },
  remove: { fontSize: 16, color: "#71717a", padding: 4 },
});
