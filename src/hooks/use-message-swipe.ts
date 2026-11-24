import { useMemo, useState } from "react";
import { PanResponder } from "react-native";

import { isHorizontalSwipe, SWIPE_REPLY, swipeOffset } from "@/utils/message-reply";

function createSwipeResponder(onReply: () => void, setOffset: (offset: number) => void) {
  // PanResponder resets dx when it takes ownership of a horizontal gesture.
  let initialDx = 0;

  return PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, { dx, dy, numberActiveTouches }) => {
      if (numberActiveTouches !== 1 || !isHorizontalSwipe(dx, dy)) return false;
      initialDx = dx;
      return true;
    },
    onPanResponderGrant: () => setOffset(swipeOffset(initialDx)),
    onPanResponderMove: (_, { dx }) => setOffset(swipeOffset(initialDx + dx)),
    onPanResponderRelease: (_, { dx }) => {
      setOffset(0);
      if (Math.abs(initialDx + dx) >= SWIPE_REPLY) onReply();
    },
    onPanResponderTerminate: () => setOffset(0),
  });
}

export function useMessageSwipe(onReply: () => void, onOpenMenu: () => void) {
  const [offset, setOffset] = useState(0);
  const { panHandlers } = useMemo(() => createSwipeResponder(onReply, setOffset), [onReply]);
  return { surface: panHandlers, offset, onLongPress: onOpenMenu };
}
