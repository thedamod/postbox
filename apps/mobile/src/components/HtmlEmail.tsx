import { useWindowDimensions, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import RenderHtml, {
  defaultHTMLElementModels,
  defaultSystemFonts,
  HTMLElementModel,
  HTMLContentModel,
  type MixedStyleDeclaration,
} from "react-native-render-html";

import { rewriteRemoteImageSources, replaceMediaWithLinks } from "@postbox/email-client/domain";

import { API_BASE_URL } from "../lib/api";
import { useTheme } from "../theme";
import { AppText } from "./AppText";

// Paper ink shared with the web client's mail-body-paper treatment.
const EMAIL_INK = "#202124";
const EMAIL_MUTED = "#5f6368";
const EMAIL_LINE = "#dadce0";
const EMAIL_LINK = "#1a73e8";
const EMAIL_CODE_BG = "#f1f3f4";

type HtmlEmailProps = {
  html: string | null;
  text: string | null;
};

// Legacy email markup relies on the HTML4 <font> tag, which is not part of the
// HTML5 standard and therefore absent from react-native-render-html's default
// element models — the engine would drop it (with a console warning), losing
// the color/face/size attributes that most promotional and institutional email
// uses for styling. Register an explicit model so those attributes map to
// React Native text styles instead.
const FONT_SIZES = new Map([
  ["1", 10],
  ["2", 13],
  ["3", 16],
  ["4", 18],
  ["5", 24],
  ["6", 32],
  ["7", 48],
]);

function parseFontSize(size: string | undefined): number | undefined {
  if (!size) return undefined;
  if (FONT_SIZES.has(size)) return FONT_SIZES.get(size);
  const relative = /^[+-]\d+$/.test(size);
  if (relative) {
    const delta = Number(size);
    const base = 3 + delta;
    return FONT_SIZES.get(String(base)) ?? FONT_SIZES.get("3");
  }
  return undefined;
}

const fontElementModel = HTMLElementModel.fromCustomModel({
  tagName: "font",
  contentModel: HTMLContentModel.textual,
  getMixedUAStyles: ({ attributes }) => {
    const styles: MixedStyleDeclaration = {};
    const color = attributes.color;
    if (typeof color === "string" && color.length > 0) {
      styles.color = color;
    }
    const face = attributes.face;
    if (typeof face === "string" && face.length > 0) {
      // RN expects a single family name; the first one in a comma-separated
      // fallback stack is the best approximation.
      styles.fontFamily = face.split(",")[0].trim();
    }
    const fontSize = parseFontSize(attributes.size);
    if (fontSize) {
      styles.fontSize = fontSize;
    }
    return Object.keys(styles).length > 0 ? styles : null;
  },
});

// Email table markup is famously attribute-driven: bgcolor, width, border and
// cellpadding/cellspacing on <table>/<tr>/<td>/<th>. The default models only
// map inline `style=` declarations, so extend them to translate the legacy
// attributes into React Native styles.
function tableAttrStyles(
  tagName: string,
  attributes: Record<string, string>,
): MixedStyleDeclaration | null {
  const styles: MixedStyleDeclaration = {};
  if (typeof attributes.bgcolor === "string" && attributes.bgcolor.length > 0) {
    styles.backgroundColor = attributes.bgcolor;
  }
  if (/^\d+$/.test(attributes.width ?? "")) {
    styles.width = Number(attributes.width);
  }
  if (tagName === "table" && /^\d+$/.test(attributes.border ?? "")) {
    styles.borderWidth = Number(attributes.border);
    styles.borderStyle = "solid";
  }
  if (
    (tagName === "td" || tagName === "th") &&
    attributes.align === "center"
  ) {
    styles.alignSelf = "center";
  }
  return Object.keys(styles).length > 0 ? styles : null;
}

const tableElementModels = {
  table: defaultHTMLElementModels.table.extend({
    getMixedUAStyles: ({ attributes }) => tableAttrStyles("table", attributes),
  }),
  tr: defaultHTMLElementModels.tr.extend({
    getMixedUAStyles: ({ attributes }) => tableAttrStyles("tr", attributes),
  }),
  td: defaultHTMLElementModels.td.extend({
    getMixedUAStyles: ({ attributes }) => tableAttrStyles("td", attributes),
  }),
  th: defaultHTMLElementModels.th.extend({
    getMixedUAStyles: ({ attributes }) => tableAttrStyles("th", attributes),
  }),
};

/**
 * Renders an email body. When the message has an `html` part it is rendered
 * as authored on a light sheet — identical in both app modes, matching the
 * web client's paper treatment — so the same message looks the same
 * everywhere (links open in the in-app browser); otherwise the plain text
 * part is shown in themed ink.
 */
export function HtmlEmail({ html, text }: HtmlEmailProps) {
  const { width } = useWindowDimensions();
  const { fonts } = useTheme();

  if (!html) {
     return <AppText style={{ fontSize: 17, lineHeight: 26 }}>{text ?? "(no body)"}</AppText>;
  }

  const cellStyle: MixedStyleDeclaration = {
    paddingVertical: 4,
    paddingHorizontal: 6,
  };

  // Paper treatment: light sheet + ink defaults shared with the web client.
  // Authored inline styles still override these, as on the web. Remote
  // pixels go through the privacy-safe image proxy so they simply load.
  const paper = {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 16,
  };

  const proxiedHtml = rewriteRemoteImageSources(
    replaceMediaWithLinks(html),
    (url) => `${API_BASE_URL}/api/image?url=${encodeURIComponent(url)}`,
  );

  return (
    <View style={paper}>
    <RenderHtml
      contentWidth={width - 32}
      source={{ html: proxiedHtml }}
      systemFonts={[...defaultSystemFonts, fonts.regular, fonts.medium, fonts.bold]}
      customHTMLElementModels={{
        font: fontElementModel,
        ...tableElementModels,
      }}
      baseStyle={{
        color: EMAIL_INK,
        fontFamily: fonts.regular,
         fontSize: 17,
         lineHeight: 26,
      }}
      tagsStyles={{
        a: { color: EMAIL_LINK, textDecorationLine: "underline" },
        h1: { fontSize: 22, fontFamily: fonts.bold, color: EMAIL_INK },
        h2: { fontSize: 19, fontFamily: fonts.bold, color: EMAIL_INK },
        h3: { fontSize: 17, fontFamily: fonts.medium, color: EMAIL_INK },
        p: { marginVertical: 4 },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: EMAIL_LINE,
          paddingLeft: 12,
          marginLeft: 0,
          color: EMAIL_MUTED,
        },
        img: { borderRadius: 8 },
        table: { borderWidth: 1, borderColor: EMAIL_LINE },
        tr: { borderBottomWidth: 1, borderBottomColor: EMAIL_LINE },
        td: cellStyle,
        th: {
          ...cellStyle,
          fontWeight: "700",
          backgroundColor: EMAIL_CODE_BG,
        },
      }}
      defaultTextProps={{ selectable: true }}
      renderersProps={{
        a: {
          onPress: (_event, href) => {
            void WebBrowser.openBrowserAsync(href).catch(() => undefined);
          },
        },
      }}
    />
    </View>
  );
}
