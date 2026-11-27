import { useState } from "react";
import { Button, Popover, Text, XStack } from "tamagui";

import { ChevronLeft } from "@/components/icons";
import MessageReactionPicker from "@/components/message-reaction-picker";
import { Spacing } from "@/config/layout";
import type { MessageOptionsButtonProps } from "./message-options-button";

export default function MessageOptionsButton({ messageId, onEditTags, onReply, reaction, onReact }: MessageOptionsButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen} placement="top-end" offset={Spacing.one}
      allowFlip={{ padding: Spacing.two }} stayInFrame={{ padding: Spacing.two }}>
      <Popover.Trigger asChild>
        <Button className="message-options-trigger" size="sm" w={Spacing.six} px={Spacing.one}
          variant="quiet" aria-label={`Optionen für Nachricht ${messageId}`}>
          <XStack rotate="-90deg" aria-hidden>
            <ChevronLeft color="text" size={16} />
          </XStack>
        </Button>
      </Popover.Trigger>
      <Popover.Content aria-label="Nachrichtenoptionen" backgroundColor="background"
        borderWidth={1} borderColor="backgroundSelected" rounded={Spacing.two} p={Spacing.two} gap={Spacing.one}>
        <Text color="textSecondary" fontSize={12}>Reaktionen bleiben auf diesem Gerät.</Text>
        <MessageReactionPicker selected={reaction} onSelect={(emoji) => {
          setOpen(false);
          onReact(emoji);
        }} />
        <Button size="sm" variant="quiet" onPress={() => {
          setOpen(false);
          onReply();
        }}>Antworten</Button>
        <Button size="sm" variant="quiet" onPress={() => {
          setOpen(false);
          onEditTags();
        }}>
          Tags bearbeiten
        </Button>
      </Popover.Content>
    </Popover>
  );
}
