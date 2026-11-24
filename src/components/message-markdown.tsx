import { Link } from "expo-router";
import type { MarkedToken, Token } from "marked";
import { memo, type ReactNode } from "react";
import { Text, XStack, YStack } from "tamagui";

import { Spacing } from "@/config/layout";
import { messageLinkUrl, parseMessageMarkdown } from "@/utils/message-markdown";

function renderInline(tokens: Token[]): ReactNode[] {
  // No Marked extensions are registered, so only its built-in tokens are emitted.
  return (tokens as MarkedToken[]).map((token, index) => {
    switch (token.type) {
      case "text":
        return token.tokens ? renderInline(token.tokens) : token.text;
      case "paragraph":
      case "heading":
        return renderInline(token.tokens);
      case "escape":
        return token.text;
      case "strong":
        return <Text key={index} fontWeight="700">{renderInline(token.tokens)}</Text>;
      case "em":
        return <Text key={index} fontStyle="italic">{renderInline(token.tokens)}</Text>;
      case "codespan":
        return (
          <Text key={index} fontFamily="mono" backgroundColor="backgroundSecondary">
            {token.text}
          </Text>
        );
      case "br":
        return "\n";
      case "link": {
        const url = messageLinkUrl(token.href);
        if (!url) return token.raw;
        return (
          <Link key={index} href={url} target="_blank" rel="noopener noreferrer" asChild>
            <Text render="a" textDecorationLine="underline">
              {renderInline(token.tokens)}
            </Text>
          </Link>
        );
      }
      default:
        return token.raw;
    }
  });
}

function renderBlocks(tokens: Token[]): ReactNode[] {
  return (tokens as MarkedToken[]).map((token, index) => {
    switch (token.type) {
      case "space":
        return null;
      case "blockquote":
        return (
          <YStack key={index} borderLeftWidth={2} borderLeftColor="accent" px={Spacing.two}
            py={Spacing.one} backgroundColor="backgroundSecondary" rounded={Spacing.one} gap={Spacing.one}>
            {renderBlocks(token.tokens)}
          </YStack>
        );
      case "code":
        return (
          <YStack key={index} backgroundColor="backgroundSecondary" p={Spacing.two} rounded={Spacing.one}>
            <Text color="text" fontFamily="mono" whiteSpace="pre-wrap" overflowWrap="anywhere">
              {token.text}
            </Text>
          </YStack>
        );
      case "list": {
        const { start, items } = token;
        return (
          <YStack key={index} role="list" gap={Spacing.one}>
            {items.map((item, itemIndex) => (
              <XStack key={itemIndex} role="listitem" gap={Spacing.two} items="flex-start">
                <Text color="text">{start === "" ? "•" : `${start + itemIndex}.`}</Text>
                <YStack shrink={1} minW={0} gap={Spacing.one}>
                  {renderBlocks(item.tokens)}
                </YStack>
              </XStack>
            ))}
          </YStack>
        );
      }
      default:
        return (
          <Text
            key={index}
            color="text"
            whiteSpace="pre-wrap"
            overflowWrap="anywhere"
            fontWeight={token.type === "heading" ? "700" : undefined}
          >
            {renderInline([token])}
          </Text>
        );
    }
  });
}

export default memo(function MessageMarkdown({ text }: Readonly<{ text: string }>) {
  if (!text) return null;

  return <YStack minW={0} gap={Spacing.one}>{renderBlocks(parseMessageMarkdown(text))}</YStack>;
});
