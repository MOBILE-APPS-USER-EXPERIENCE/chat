
import { Tabs } from 'expo-router';
import { useTheme } from 'tamagui';
import { MessagesCircle, User } from '../../components/icons';

export default function TabsLayout() {
    const theme = useTheme();

    return (
        <Tabs
            screenOptions={{
                headerShown: false,
                tabBarActiveTintColor: theme.accent.val,
                tabBarInactiveTintColor: theme.textSecondary.val,
                tabBarStyle: { backgroundColor: theme.background.val },
            }}
        >
            <Tabs.Screen
                name="index"
                options={{
                    title: 'Chats',
                    tabBarIcon: ({ color, size }) => <MessagesCircle color={color} size={size} />,
                }}
            />
            <Tabs.Screen
                name="profile"
                options={{
                    title: 'Profil',
                    tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
                }}
            />
        </Tabs>
    );
}
