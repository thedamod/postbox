import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { ComposeScreen } from "./features/compose/ComposeScreen";
import { InboxScreen } from "./features/inbox/InboxScreen";
import { MessageScreen } from "./features/message/MessageScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";

export type RootStackParamList = {
  Inbox: undefined;
  Message: { messageId: number };
  Compose: undefined;
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Inbox"
        component={InboxScreen}
        options={{ headerShown: false, animation: "fade" }}
      />
      <Stack.Screen
        name="Message"
        component={MessageScreen}
        options={{ headerShown: false, animation: "slide_from_right" }}
      />
      <Stack.Screen
        name="Compose"
        component={ComposeScreen}
        options={{ headerShown: false, presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings", animation: "slide_from_right" }}
      />
    </Stack.Navigator>
  );
}
