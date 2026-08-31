import { useWindowDimensions } from "react-native";
import * as WebBrowser from "expo-web-browser";
import RenderHtml, {
  defaultHTMLElementModels,
  defaultSystemFonts,
  HTMLElementModel,
  HTMLContentModel,
  type MixedStyleDeclaration,
} from "react-native-render-html";

import { withAlpha } from "../lib/color";
import { useTheme } from "../theme";
import { AppText } from "./AppText";

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
 * faithfully via react-native-render-html (links open in the in-app browser);
 * otherwise the plain text part is shown.
 */
export function HtmlEmail({ html, text }: HtmlEmailProps) {
  const { width } = useWindowDimensions();
  const { palette, fonts } = useTheme();

  if (!html) {
     return <AppText style={{ fontSize: 17, lineHeight: 26 }}>{text ?? "(no body)"}</AppText>;
  }

  const cellStyle: MixedStyleDeclaration = {
    paddingVertical: 4,
    paddingHorizontal: 6,
  };

  return (
    <RenderHtml
      contentWidth={width}
      source={{ html }}
      systemFonts={[...defaultSystemFonts, fonts.regular, fonts.medium, fonts.bold]}
      customHTMLElementModels={{
        font: fontElementModel,
        ...tableElementModels,
      }}
      baseStyle={{
        color: palette.foreground,
        fontFamily: fonts.regular,
         fontSize: 17,
         lineHeight: 26,
      }}
      tagsStyles={{
        a: { color: palette.primary, textDecorationLine: "underline" },
        h1: { fontSize: 22, fontFamily: fonts.bold },
        h2: { fontSize: 19, fontFamily: fonts.bold },
        h3: { fontSize: 17, fontFamily: fonts.medium },
        p: { marginVertical: 4 },
        blockquote: {
          borderLeftWidth: 3,
          borderLeftColor: palette.border,
          paddingLeft: 12,
          marginLeft: 0,
          color: palette.mutedForeground,
        },
        img: { borderRadius: 8 },
        table: { borderWidth: 1, borderColor: palette.border },
        tr: { borderBottomWidth: 1, borderBottomColor: palette.border },
        td: cellStyle,
        th: {
          ...cellStyle,
          fontWeight: "700",
          backgroundColor: withAlpha(palette.muted, 0.6),
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
  );
}
