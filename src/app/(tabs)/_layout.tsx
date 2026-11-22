import { Tabs } from "expo-router";
import { useTheme } from "tamagui";
import { MessagesCircle, User } from "../../components/icons";

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent.val,
        tabBarInactiveTintColor: theme.textSecondary.val,
        tabBarStyle: {
          backgroundColor: theme.background.val,
          borderColor: theme.textSecondary.val,
          minHeight: 72,
          paddingTop: 8,
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
