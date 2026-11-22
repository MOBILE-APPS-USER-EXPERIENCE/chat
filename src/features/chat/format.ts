import { ApiError } from '@/api/apiClient';
import type { Message } from '@/api/types';

const errors: Record<number, string> = {
  403: 'Es fehlen Angaben. Bitte prüfe deine Eingaben und versuche es erneut.',
  500: 'Der Server konnte die Aktion nicht abschließen. Bitte versuche es erneut.',
  503: 'Der Server ist gerade nicht verfügbar. Bitte versuche es gleich noch einmal.',
  451: 'Bitte verwende deine HSE-Kennung, z. B. abcdit01.',
  452: 'Diese Kennung ist bereits registriert. Melde dich stattdessen an.',
  453: 'Das Passwort muss mindestens 6 Zeichen haben.',
  454: 'Zu dieser Kennung gibt es noch kein Konto.',
  455: 'Das Passwort stimmt nicht. Bitte versuche es erneut.',
  456: 'Deine Sitzung ist abgelaufen. Bitte melde dich erneut an.',
  458: 'Dieser Chat ist nicht mehr verfügbar oder du hast keinen Zugriff.',
  462: 'Der Chatname muss mindestens 2 Zeichen haben.',
  466: 'Der Anzeigename muss mindestens 2 Zeichen haben.',
  467: 'Der Anzeigename darf höchstens 30 Zeichen haben.',
  468: 'Der vollständige Name muss mindestens 2 Zeichen haben.',
  469: 'Der vollständige Name darf höchstens 30 Zeichen haben.',
};

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return errors[error.code] ?? error.message;
  if (error instanceof Error && error.message.startsWith('Der Server')) return error.message;
  return 'Der Server ist gerade nicht erreichbar. Prüfe deine Verbindung und versuche es erneut.';
}

export function decodeText(text = ''): string {
  const entities: Record<string, string> = {
    amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  };
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    if (entity.startsWith('#')) {
      const value = entity[1].toLowerCase() === 'x'
        ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }
    return entities[entity.toLowerCase()] ?? match;
  });
}

export function serverDate(time: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})$/.exec(time);
  if (!parts) return null;
  return new Date(+parts[1], +parts[2] - 1, +parts[3], +parts[4], +parts[5], +parts[6]);
}

export function messageTime(time: string): string {
  return serverDate(time)?.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) ?? time;
}

export function messageDay(time: string): string {
  const date = serverDate(time);
  if (!date) return time;
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]).join('').toUpperCase() || '?';
}

export function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const messages = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => messages.set(message.id, message));
  return [...messages.values()].sort((a, b) => a.id - b.id);
}
