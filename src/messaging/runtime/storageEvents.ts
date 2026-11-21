type Listener = () => void;

/**
 * Plain pub/sub for local storage changes. No Expo/React imports: this is consumed by both the
 * scheduler (emitting) and hooks (subscribing) without any framework dependency.
 *
 * `subscribeMessages` works even if `emitMessages` for that chat id was never called before: the
 * per-chat listener set is created lazily on first subscription. It is dropped again once its
 * last listener unsubscribes, so chat ids nobody is watching do not accumulate empty buses
 * forever (a chat that is re-opened later simply gets a fresh bus).
 */
export class StorageEvents {
  private readonly chatListeners = new Set<Listener>();
  private readonly messageListeners = new Map<number, Set<Listener>>();

  subscribeChats(listener: Listener): () => void {
    this.chatListeners.add(listener);
    return () => {
      this.chatListeners.delete(listener);
    };
  }

  emitChats(): void {
    for (const listener of [...this.chatListeners]) listener();
  }

  subscribeMessages(chatId: number, listener: Listener): () => void {
    const bus = this.messageListeners.get(chatId) ?? new Set<Listener>();
    if (!this.messageListeners.has(chatId))
      this.messageListeners.set(chatId, bus);
    bus.add(listener);
    return () => {
      bus.delete(listener);
      if (bus.size === 0) this.messageListeners.delete(chatId);
    };
  }

  emitMessages(chatId: number): void {
    const bus = this.messageListeners.get(chatId);
    if (bus === undefined) return;
    for (const listener of [...bus]) listener();
  }
}
