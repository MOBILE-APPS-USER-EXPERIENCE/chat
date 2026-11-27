import type { ComponentType } from "react";

export type MessageOptionsButtonProps = {
  messageId: number;
  onEditTags: () => void;
  onReply: () => void;
  reaction?: string;
  onReact: (emoji: string) => void;
};

const MessageOptionsButton: ComponentType<MessageOptionsButtonProps> = () => null;

export default MessageOptionsButton;
