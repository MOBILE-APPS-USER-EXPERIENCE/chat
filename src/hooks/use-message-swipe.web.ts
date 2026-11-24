import { useEffect, useRef, useState, type PointerEvent } from "react";
import { useMedia } from "tamagui";

import { isHorizontalSwipe, SWIPE_REPLY, SWIPE_START, swipeOffset } from "@/utils/message-reply";

type Drag = { pointer: number; x: number; y: number; horizontal: boolean; hold: ReturnType<typeof setTimeout> };

export function useMessageSwipe(onReply: () => void, onOpenMenu: () => void) {
  const drag = useRef<Drag | null>(null);
  const [offset, setOffset] = useState(0);
  const swipeEnabled = useMedia()["max-lg"];

  useEffect(() => () => {
    if (drag.current) clearTimeout(drag.current.hold);
  }, []);

  function reset() {
    if (drag.current) clearTimeout(drag.current.hold);
    drag.current = null;
    setOffset(0);
  }

  return {
    offset: swipeEnabled ? offset : 0,
    onLongPress: undefined,
    surface: {
      touchAction: swipeEnabled ? "pan-y pinch-zoom" : undefined,
      onPointerDown(event: PointerEvent<HTMLElement>) {
        if (!event.isPrimary || event.button !== 0 ||
          (event.target instanceof Element && event.target.closest("a, button, [role='button']"))) return;
        const { pointerId, clientX, clientY } = event;
        reset();
        drag.current = {
          pointer: pointerId, x: clientX, y: clientY, horizontal: false,
          hold: setTimeout(() => {
            reset();
            onOpenMenu();
          }, 500),
        };
      },
      onPointerMove(event: PointerEvent<HTMLElement>) {
        const start = drag.current;
        if (!start || event.pointerId !== start.pointer) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.horizontal && Math.hypot(dx, dy) < SWIPE_START) return;
        if (!swipeEnabled || (!start.horizontal && !isHorizontalSwipe(dx, dy))) {
          reset();
          return;
        }
        if (!start.horizontal) {
          clearTimeout(start.hold);
          start.horizontal = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        setOffset(swipeOffset(dx));
      },
      onPointerUp(event: PointerEvent<HTMLElement>) {
        const start = drag.current;
        if (!start || event.pointerId !== start.pointer) return;
        reset();
        if (swipeEnabled && start.horizontal && Math.abs(event.clientX - start.x) >= SWIPE_REPLY) onReply();
      },
      onPointerCancel: reset,
      onMouseLeave: () => { if (!drag.current?.horizontal) reset(); },
    },
  };
}
