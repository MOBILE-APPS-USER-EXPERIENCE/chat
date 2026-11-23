/** @jest-environment node */
import { StorageEvents } from "./storageEvents";

describe("StorageEvents", () => {
  test("subscribeAnyMessages receives emitMessages for any chat", () => {
    const events = new StorageEvents();
    const listener = jest.fn();
    const unsubscribe = events.subscribeAnyMessages(listener);
    events.emitMessages(1);
    events.emitMessages(2);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    events.emitMessages(3);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("chats bus fires all subscribers", () => {
    const events = new StorageEvents();
    const a = jest.fn();
    const b = jest.fn();
    events.subscribeChats(a);
    events.subscribeChats(b);
    events.emitChats();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  test("messages bus is scoped per chat id and does not cross-fire", () => {
    const events = new StorageEvents();
    const forChat1 = jest.fn();
    const forChat2 = jest.fn();
    events.subscribeMessages(1, forChat1);
    events.subscribeMessages(2, forChat2);
    events.emitMessages(1);
    expect(forChat1).toHaveBeenCalledTimes(1);
    expect(forChat2).not.toHaveBeenCalled();
  });

  test("unsubscribing stops notifications", () => {
    const events = new StorageEvents();
    const listener = jest.fn();
    const unsubscribe = events.subscribeChats(listener);
    unsubscribe();
    events.emitChats();
    expect(listener).not.toHaveBeenCalled();
  });

  test("subscribeMessages works even when emitMessages for that id was never called before", () => {
    const events = new StorageEvents();
    const listener = jest.fn();
    expect(() => events.subscribeMessages(42, listener)).not.toThrow();
    events.emitMessages(42);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("emitting with no subscribers is fine", () => {
    const events = new StorageEvents();
    expect(() => events.emitChats()).not.toThrow();
    expect(() => events.emitMessages(99)).not.toThrow();
  });

  test("unsubscribing the last listener for a chat id drops its bus, a later subscriber starts fresh", () => {
    const events = new StorageEvents();
    const first = jest.fn();
    const unsubscribe = events.subscribeMessages(5, first);
    unsubscribe();
    const second = jest.fn();
    events.subscribeMessages(5, second);
    events.emitMessages(5);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("outbox bus is scoped per chat id and does not cross-fire", () => {
    const events = new StorageEvents();
    const forChat1 = jest.fn();
    const forChat2 = jest.fn();
    events.subscribeOutbox(1, forChat1);
    events.subscribeOutbox(2, forChat2);
    events.emitOutbox(1);
    expect(forChat1).toHaveBeenCalledTimes(1);
    expect(forChat2).not.toHaveBeenCalled();
  });

  test("subscribeOutbox works even when emitOutbox for that id was never called before", () => {
    const events = new StorageEvents();
    const listener = jest.fn();
    expect(() => events.subscribeOutbox(42, listener)).not.toThrow();
    events.emitOutbox(42);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("emitting outbox with no subscribers is fine", () => {
    const events = new StorageEvents();
    expect(() => events.emitOutbox(99)).not.toThrow();
  });

  test("unsubscribing the last outbox listener for a chat id drops its bus, a later subscriber starts fresh", () => {
    const events = new StorageEvents();
    const first = jest.fn();
    const unsubscribe = events.subscribeOutbox(5, first);
    unsubscribe();
    const second = jest.fn();
    events.subscribeOutbox(5, second);
    events.emitOutbox(5);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});
