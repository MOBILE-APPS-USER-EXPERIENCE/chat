type Listener = () => void;

/**
 * Plain pub/sub for local storage changes. No Expo/React imports: this is consumed by both the
 * scheduler (emitting) and hooks (subscribing) without any framework dependency.
 *
 * `subscribeMessages`/`subscribeOutbox` work even if the matching `emit*` for that chat id was
 * never called before: the per-chat listener set is created lazily on first subscription. It is
 * dropped again once its last listener unsubscribes, so chat ids nobody is watching do not
 * accumulate empty buses forever (a chat that is re-opened later simply gets a fresh bus).
 */
export class StorageEvents {
  private readonly chatListeners = new Set<Listener>();
  private readonly messageListeners = new Map<number, Set<Listener>>();
  private readonly outboxListeners = new Map<number, Set<Listener>>();

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

  subscribeOutbox(chatId: number, listener: Listener): () => void {
    const bus = this.outboxListeners.get(chatId) ?? new Set<Listener>();
    if (!this.outboxListeners.has(chatId))
      this.outboxListeners.set(chatId, bus);
    bus.add(listener);
    return () => {
      bus.delete(listener);
      if (bus.size === 0) this.outboxListeners.delete(chatId);
    };
  }

  emitOutbox(chatId: number): void {
    const bus = this.outboxListeners.get(chatId);
    if (bus === undefined) return;
    for (const listener of [...bus]) listener();
  }
}
