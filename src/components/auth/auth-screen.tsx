// components/auth/auth-screen.tsx
import { config } from "@/constants/config";
import { Spacing } from "@/constants/layout";
import { router, type Href } from "expo-router";
import type { ReactNode } from "react";
import { KeyboardAvoidingView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Button,
  Form,
  H1,
  H2,
  ScrollView,
  Spinner,
  Text,
  YStack,
} from "tamagui";

type Props = {
  title: string;
  subtitle: string;
  submitLabel: string;
  isSubmitting: boolean;
  error?: string;
  onSubmit: () => void;
  switchLabel: string;
  switchHref: Href;
  children: ReactNode;
};

export function AuthScreen({
  title,
  subtitle,
  submitLabel,
  isSubmitting,
  error,
  onSubmit,
  switchLabel,
  switchHref,
  children,
}: Readonly<Props>) {
  const insets = useSafeAreaInsets();

  return (
    <YStack flex={1} backgroundColor="background">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          px={Spacing.four}
          pt={insets.top + Spacing.five}
          pb={insets.bottom + Spacing.four}
        >
          <Form onSubmit={onSubmit}>
            <YStack self="center" gap={Spacing.three} minW={"96"}>
              <H1>{config.appName}</H1>
              <H2>{title}</H2>
              <Text color="textSecondary" mb={Spacing.two}>
                {subtitle}
              </Text>

              {children}

              {!!error && (
                <Text color="error" mt={Spacing.one}>
                  {error}
                </Text>
              )}

              <Form.Trigger asChild>
                <Button
                  disabled={isSubmitting}
                  backgroundColor="text"
                  color="background"
                  mt={Spacing.two}
                  h={48}
                >
                  {isSubmitting ? <Spinner color="background" /> : submitLabel}
                </Button>
              </Form.Trigger>

              <Button
                variant="quiet"
                color="accent"
                fontSize={14}
                h={30}
                mt={Spacing.three}
                onPress={() => router.replace(switchHref)}
              >
                {switchLabel}
              </Button>
            </YStack>
          </Form>
        </ScrollView>
      </KeyboardAvoidingView>
    </YStack>
  );
}
