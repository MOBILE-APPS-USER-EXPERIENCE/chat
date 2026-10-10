const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the real TypeScript services with isolated device storage and fetch.
function loadServices(initial = {}) {
  const storage = new Map(Object.entries(initial));
  const asyncStorage = {
    getItem: async (key) => storage.get(key) ?? null,
    setItem: async (key, value) => { storage.set(key, value); },
    removeItem: async (key) => { storage.delete(key); },
  };
  const cache = new Map();
  function load(file) {
    const absolute = path.resolve(__dirname, '../src', file);
    if (cache.has(absolute)) return cache.get(absolute).exports;
    const module = new Module(absolute);
    cache.set(absolute, module);
    module.paths = Module._nodeModulePaths(path.dirname(absolute));
    module.require = (name) => {
      if (name === '@react-native-async-storage/async-storage') return asyncStorage;
      if (name === '@/api/apiClient') return load('api/apiClient.ts');
      if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '../src'), path.resolve(path.dirname(absolute), `${name}.ts`)));
      return require(name);
    };
    const { outputText } = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    module._compile(outputText, absolute);
    return module.exports;
  }
  return { storage, client: load('api/apiClient.ts'), auth: load('api/authService.ts'), chats: load('api/chatService.ts'), invites: load('api/inviteService.ts'), messages: load('api/messageService.ts'), format: load('features/chat/format.ts'), validation: load('features/chat/validation.ts'), chatState: load('features/chat/chat-state.ts'), titles: load('features/chat/chat-title.ts'), names: load('features/chat/chat-name-store.ts') };
}

const reply = (body, status = 200) => new Response(JSON.stringify({ status: 'ok', code: 200, ...body }), { status });

test('restores stored token, serializes setters after hydration, and attaches the latest token', async (t) => {
  const { client, storage } = loadServices({ 'chat.token': 'old-token' });
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url) => { calls.push(new URL(url)); return reply({ chats: [] }); };
  await Promise.all([client.getBaseUrl(), client.setToken('new-token')]);
  await client.request('getchats');
  assert.equal(calls[0].searchParams.get('token'), 'new-token');
  assert.equal(storage.get('chat.token'), 'new-token');
});

test('login and register persist their returned token; message POST automatically includes it; logout clears it', async (t) => {
  const { auth, client, messages, storage } = loadServices();
  const calls = [];
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async (url, init) => {
    const params = init?.method === 'POST' ? JSON.parse(init.body) : Object.fromEntries(new URL(url).searchParams);
    calls.push(params);
    return reply({ token: params.request === 'register' ? 'register-token' : 'login-token', hash: 'my-hash' });
  };
  await auth.login('abcdit01', 'test-password');
  assert.equal(client.getToken(), 'login-token');
  assert.equal(calls[0].token, undefined);
  await messages.postMessage({ chatid: 3, text: 'Hallo Welt' });
  assert.deepEqual(calls[1], { request: 'postmessage', token: 'login-token', chatid: 3, text: 'Hallo Welt' });
  await auth.register('abcdit01', 'test-password', 'Chris', 'Chris Beispiel');
  assert.equal(storage.get('chat.token'), 'register-token');
  assert.equal(calls[2].nickname, 'Chris');
  assert.equal(calls[2].token, undefined);
  await auth.logout();
  assert.equal(client.getToken(), undefined);
  assert.equal(storage.has('chat.token'), false);
  assert.equal(calls[3].token, 'register-token');
});

test('distinguishes an invalid-token JSON error from a successful HTTP 200 validation reporting an invalid token', async (t) => {
  const { auth, client } = loadServices();
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => reply({ status: 'error', code: 456, message: 'Invalid token' }, 456);
  await assert.rejects(client.request('getchats'), (error) => error instanceof client.ApiError && error.code === 456);
  global.fetch = async () => reply({ message: 'Token NOT valid' });
  assert.equal(await auth.validateToken(), false);
  global.fetch = async () => reply({ message: 'Token valid' });
  assert.equal(await auth.validateToken(), true);
});

test('orders and deduplicates polled messages and renders PHP timestamps and encoded punctuation', () => {
  const { format } = loadServices();
  const result = format.mergeMessages([{ id: 3, text: 'old' }, { id: 1 }], [{ id: 3, text: 'updated' }, { id: 2 }]);
  assert.deepEqual(result.map((message) => message.id), [1, 2, 3]);
  assert.equal(result[2].text, 'updated');
  assert.equal(format.messageTime('2026-09-13_18-22-05'), '18:22');
  assert.equal(format.messageDay('2026-09-13_18-22-05'), '13. September 2026');
  assert.equal(format.decodeText('Du &amp; ich: &quot;Hallo&quot; &#039; &#x1F44B;'), 'Du & ich: "Hallo" \' 👋');
});

test('login needs no registration names; registration returns field-specific errors using the API constraints', () => {
  const { validation } = loadServices();
  assert.deepEqual(validation.validateCredentials('login', { userid: 'abcdit01', password: 'existing', nickname: '', fullname: '' }), {});
  const invalid = validation.validateCredentials('register', { userid: 'chris', password: 'short', nickname: 'X', fullname: '' });
  assert.deepEqual(Object.keys(invalid).sort(), ['fullname', 'nickname', 'password', 'userid']);
  assert.deepEqual(validation.validateCredentials('register', { userid: ' ABCDIT01 ', password: 'abcdef', nickname: ' Chris ', fullname: 'Chris Beispiel' }), {});
  const tooLong = validation.validateCredentials('register', { userid: 'abcdit01', password: 'abcdef', nickname: 'X'.repeat(31), fullname: 'X'.repeat(31) });
  assert.deepEqual(Object.keys(tooLong).sort(), ['fullname', 'nickname']);
});

test('creates a named chat and invites by public hash using the session token without an admin key', async (t) => {
  const { client, chats, invites } = loadServices({ 'chat.token': 'session-token', 'chat.adminKey': 'unused-admin' });
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const calls = [];
  global.fetch = async (url) => { calls.push(Object.fromEntries(new URL(url).searchParams)); return reply({ chatid: '12' }); };
  const id = await chats.createChat({ chatname: 'Lerngruppe & Freunde', ispublic: false, directchat: false });
  assert.equal(id, 12);
  await invites.invite(id, 'public-user-hash', false);
  assert.deepEqual(calls, [
    { request: 'createchat', token: 'session-token', chatname: 'Lerngruppe & Freunde', ispublic: 'false', directchat: 'false' },
    { request: 'invite', token: 'session-token', chatid: '12', invitedhash: 'public-user-hash' },
  ]);
  global.fetch = async () => reply({ status: 'error', code: 462, message: 'Chat name too short' });
  await assert.rejects(chats.createChat({ chatname: 'X' }), (error) => error instanceof client.ApiError && error.code === 462);
});

test('normalizes listing ids to the same numbers as creation; malformed creation ids cannot open a phantom chat', async (t) => {
  const { chats } = loadServices();
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  global.fetch = async () => reply({ chats: [{ chatid: '12', joined: true }, { chatid: 0, joined: true }] });
  assert.deepEqual((await chats.getChats(false)).map((chat) => chat.chatid), [12, 0]);
  for (const chatid of [undefined, '', null, 'wrong', -1]) {
    global.fetch = async () => reply({ chatid });
    await assert.rejects(chats.createChat({ chatname: 'Lerngruppe' }), /keine gültige Chat-ID/);
  }
});

test('a lagging listing keeps the new private chat visible, then uses confirmed server membership and supports later removal', () => {
  const { chatState } = loadServices();
  const main = { chatid: 0, joined: true };
  const created = { chatid: 12, chatname: 'Privat', joined: true, role: 'owner' };
  const pending = new Map([[12, created]]);
  assert.deepEqual(chatState.reconcileChats([main], pending), [main, created]);
  assert.equal(pending.size, 1);
  const confirmed = { ...created, participants: [{ hash: 'owner' }], invited: [{ hash: 'friend' }] };
  assert.deepEqual(chatState.reconcileChats([main, confirmed], pending), [main, confirmed]);
  assert.equal(pending.size, 0);
  assert.deepEqual(chatState.reconcileChats([main], pending), [main]);
});

test('polling identical chat URLs bypasses the browser HTTP cache and receives the latest listing', async (t) => {
  const { chats } = loadServices({ 'chat.token': 'session-token' });
  const originalFetch = global.fetch;
  t.after(() => { global.fetch = originalFetch; });
  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url, cache: init.cache });
    return reply({ chats: calls.length === 1 ? [{ chatid: '0' }] : [{ chatid: '0' }, { chatid: '12' }] });
  };
  assert.deepEqual((await chats.getChats(false)).map((chat) => chat.chatid), [0]);
  assert.deepEqual((await chats.getChats(false)).map((chat) => chat.chatid), [0, 12]);
  assert.equal(calls[0].url, calls[1].url);
  assert.ok(calls.every((call) => call.cache === 'no-store'));
});

test('direct conversations use the other person for each viewer, including an invitation awaiting acceptance', () => {
  const { titles } = loadServices();
  const owner = { hash: 'own', nickname: 'Chris', fullname: 'Chris Beispiel', userid: 'abcdit01' };
  const peer = { hash: 'peer', nickname: 'Sam &amp; Co', fullname: 'Sam Muster', userid: 'efghit02' };
  const chat = { chatid: 9, chatname: 'Original', directchat: true, owner, participants: [owner], invited: [peer] };
  assert.equal(titles.chatTitle(chat, owner.hash), 'Sam & Co');
  assert.equal(titles.chatTitle(chat, peer.hash), 'Chris');
  assert.equal(titles.chatTitle({ ...chat, participants: [owner, peer], invited: [] }, owner.hash), 'Sam & Co');
  assert.equal(titles.chatTitle({ ...chat, directchat: false }, owner.hash), 'Original');
  assert.equal(titles.chatTitle(chat, owner.hash, { 9: 'Mein Anzeigename' }), 'Mein Anzeigename');
});

test('personal chat names survive storage reload and are isolated by server and account; corrupt entries are ignored', async () => {
  const { names, client, storage } = loadServices();
  const key = await names.chatNameKey('owner');
  assert.notEqual(key, await names.chatNameKey('peer'));
  await names.saveChatNames(key, { 9: 'Studium' });
  assert.deepEqual(await names.loadChatNames(key), { 9: 'Studium' });
  assert.deepEqual(await names.loadChatNames(await names.chatNameKey('peer')), {});
  await client.setBaseUrl('https://other.example');
  assert.notEqual(key, await names.chatNameKey('owner'));
  storage.set(key, JSON.stringify({ 9: 'Studium', 12: 42, 13: '', invalid: 'No' }));
  assert.deepEqual(await names.loadChatNames(key), { 9: 'Studium' });
  storage.set(key, '{broken');
  assert.deepEqual(await names.loadChatNames(key), {});
});
