import { Spacing } from "@/config/layout";
import { Tabs } from "expo-router";
import { useTheme } from "tamagui";
import { Compass, Mail, MessagesCircle, User } from "../../components/icons";
import { useInvitations } from "../../hooks/use-chat-lists";

export default function TabsLayout() {
  const theme = useTheme();
  const { invitations } = useInvitations();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent.val,
        tabBarInactiveTintColor: theme.textSecondary.val,
        tabBarStyle: {
          backgroundColor: theme.background.val,
          borderColor: theme.textSecondary.val,
          minHeight: Spacing.ten,
          paddingTop: Spacing.two,
        },
        sceneStyle: {
          paddingHorizontal: Spacing.two,
          backgroundColor: theme.background.val,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Chats",
          // The `color` param is typed as nullable ColorValue, which Tamagui icons
          // reject. TabBarIcon renders the icon twice with the tints configured
          // above, so `focused` + theme tokens produce the same colors.
          tabBarIcon: ({ focused, size }) => (
            <MessagesCircle
              color={focused ? "accent" : "textSecondary"}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="public"
        options={{
          title: "Öffentlich",
          tabBarIcon: ({ focused, size }) => (
            <Compass
              color={focused ? "accent" : "textSecondary"}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="invites"
        options={{
          title: "Einladungen",
          tabBarBadge: invitations.length > 0 ? invitations.length : undefined,
          tabBarIcon: ({ focused, size }) => (
            <Mail
              color={focused ? "accent" : "textSecondary"}
              size={size}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          // See comment above: `focused` + theme tokens match the configured tints.
          tabBarIcon: ({ focused, size }) => (
            <User color={focused ? "accent" : "textSecondary"} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
