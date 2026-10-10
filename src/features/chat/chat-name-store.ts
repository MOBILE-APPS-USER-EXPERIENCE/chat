import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBaseUrl } from '@/api/apiClient';

export async function chatNameKey(hash: string): Promise<string> {
  return `chat.names:${await getBaseUrl()}:${hash}`;
}

export async function loadChatNames(key: string): Promise<Record<number, string>> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return {};
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const names: Record<number, string> = {};
    for (const [id, name] of Object.entries(value)) {
      if (/^\d+$/.test(id) && Number.isSafeInteger(Number(id)) && typeof name === 'string' && name.trim().length >= 2) names[Number(id)] = name.trim();
    }
    return names;
  } catch { return {}; }
}

export async function saveChatNames(key: string, names: Record<number, string>): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(names));
}
