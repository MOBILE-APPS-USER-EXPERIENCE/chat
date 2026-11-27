import type { ComponentType } from "react";

export type MessageOptionsButtonProps = {
  messageId: number;
  onEditTags: () => void;
  onReply: () => void;
  reaction?: string;
  onReact: (emoji: string) => void;
  /** Only set for messages the current user may edit (own text messages). */
  onEdit?: () => void;
};

const MessageOptionsButton: ComponentType<MessageOptionsButtonProps> = () => null;

export default MessageOptionsButton;
