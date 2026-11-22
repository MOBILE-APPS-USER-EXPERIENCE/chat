import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, getBaseUrl, getToken, setAdminKey, setToken } from '@/api/apiClient';
import * as auth from '@/api/authService';
import type { User } from '@/api/types';
import { getProfiles } from '@/api/userService';

import { errorText } from './format';

const SESSION_KEY = 'chat.session';
export type Session = User & { token: string };
export type Credentials = { userid: string; password: string; nickname: string; fullname: string };

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);

  const saveProfile = useCallback(async (profile: User) => {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(profile));
  }, []);

  const clear = useCallback(async () => {
    generation.current += 1;
    setSession(null);
    await Promise.all([setToken(undefined), setAdminKey(undefined), AsyncStorage.removeItem(SESSION_KEY)]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restore() {
      try {
        await getBaseUrl(); // Hydrates the API client's saved token.
        const token = getToken();
        if (!token) return;
        const cached = await AsyncStorage.getItem(SESSION_KEY);
        if (!cached) {
          await clear();
          return;
        }
        let profile: User | null;
        try { profile = JSON.parse(cached); } catch { profile = null; }
        if (!profile?.hash || !profile?.userid) {
          await clear();
          return;
        }
        if (!await auth.validateToken()) {
          await clear();
          if (!cancelled) setNotice('Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.');
          return;
        }
        if (!cancelled) setSession({ ...profile, token });
      } catch (error) {
        if (error instanceof ApiError && error.code === 456) await clear();
        // Keep cached credentials on network errors so a retry can restore them.
        if (!cancelled) setNotice(errorText(error));
      } finally {
        if (!cancelled) setRestoring(false);
      }
    }
    void restore();
    return () => { cancelled = true; };
  }, [clear]);

  const authenticate = useCallback(async (mode: 'login' | 'register', fields: Credentials) => {
    setBusy(true);
    setNotice('');
    try {
      const result = mode === 'login'
        ? await auth.login(fields.userid, fields.password)
        : await auth.register(fields.userid, fields.password, fields.nickname, fields.fullname);
      const profile: User = {
        hash: result.hash, userid: fields.userid,
        nickname: mode === 'register' ? fields.nickname : fields.userid,
        fullname: mode === 'register' ? fields.fullname : '',
      };
      await saveProfile(profile);
      generation.current += 1;
      setSession({ ...profile, token: result.token });
    } finally {
      setBusy(false);
    }
  }, [saveProfile]);

  const handleError = useCallback((error: unknown, expectedToken: string) => {
    if (getToken() !== expectedToken) return;
    if (error instanceof ApiError && error.code === 456) {
      setNotice(errorText(error));
      void clear();
    }
  }, [clear]);

  const token = session?.token;
  const hash = session?.hash;
  const userid = session?.userid;
  useEffect(() => {
    if (!token || !hash || !userid) return;
    const version = generation.current;
    let cancelled = false;
    getProfiles(false).then(async (profiles) => {
      const profile = profiles.find((entry) => entry.hash === hash);
      if (!profile || cancelled || generation.current !== version) return;
      const resolved = { ...profile, userid: profile.userid || userid };
      await saveProfile(resolved);
      if (!cancelled && generation.current === version) setSession({ ...resolved, token });
    }).catch((error) => {
      if (!cancelled) handleError(error, token);
    });
    return () => { cancelled = true; };
  }, [token, hash, userid, saveProfile, handleError]);

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      await auth.logout();
      await clear();
      setNotice('Du bist abgemeldet.');
    } catch (error) {
      if (error instanceof ApiError && error.code === 456) await clear();
      else throw error;
    } finally {
      setBusy(false);
    }
  }, [clear]);

  return { session, restoring, busy, notice, authenticate, signOut, handleError };
}
