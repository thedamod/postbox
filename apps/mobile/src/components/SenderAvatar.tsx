import { useMemo, useState } from "react";
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from "react-native";

import type { Address } from "@postbox/email-client/domain";

import { AppText } from "./AppText";
import { avatarUrl } from "../lib/avatar";

const AVATAR_COLORS = ["#e11d48", "#d97706", "#059669", "#0284c7", "#7c3aed"];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function SenderAvatar({
  sender,
  uri,
  index = 0,
  size = 40,
  style,
}: {
  sender?: Address;
  uri?: string | null;
  index?: number;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const name = sender?.name || sender?.address || "?";
  const generatedUri = useMemo(() => avatarUrl(sender?.address), [sender?.address]);
  const imageUri = uri ?? generatedUri;

  if (!imageUri || failed) {
    return (
      <View
        style={[
          styles.fallback,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
          },
        ]}
      >
        <AppText style={[styles.initials, { fontSize: size * 0.33 }]}>
          {initialsOf(name)}
        </AppText>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUri }}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length],
        },
        style,
      ]}
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { color: "#ffffff", fontWeight: "700" },
});
