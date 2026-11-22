import { useEffect, useRef, useState } from 'react';
import { chatNameKey, loadChatNames, saveChatNames } from './chat-name-store';

export function useChatNames(hash: string) {
  const [names, setNames] = useState<Record<number, string>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const key = useRef('');
  useEffect(() => {
    let stopped = false;
    chatNameKey(hash).then(async (resolved) => {
      const stored = await loadChatNames(resolved);
      if (!stopped) { key.current = resolved; setNames(stored); setReady(true); }
    }).catch(() => { if (!stopped) setError('Deine gespeicherten Chatnamen konnten nicht geladen werden. Lade die App erneut.'); });
    return () => { stopped = true; };
  }, [hash]);

  async function rename(chatid: number, title?: string) {
    if (!ready) throw new Error('Die Chatnamen werden noch geladen.');
    const next = { ...names };
    if (title !== undefined) {
      if (title.trim().length < 2) throw new Error('Bitte gib mindestens 2 Zeichen ein.');
      next[chatid] = title.trim();
    } else delete next[chatid];
    try { await saveChatNames(key.current, next); }
    catch { throw new Error('Der Name konnte nicht auf diesem Gerät gespeichert werden. Bitte versuche es erneut.'); }
    setNames(next);
  }
  return { names, ready, error, rename };
}
