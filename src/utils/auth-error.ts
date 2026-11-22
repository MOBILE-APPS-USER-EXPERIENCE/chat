import { NetworkError } from '@/api/apiClient';
import { NoServerSelectedError, StaleAccountError } from '@/session/ports';

export function describeAuthError(error: unknown, fallback: string): string {
    if (error instanceof StaleAccountError) {
        return 'Das lokale Konto gehört zu einem gelöschten Serverkonto. Die lokalen Daten müssen zuerst gelöscht werden.';
    }
    if (error instanceof NoServerSelectedError) return 'Es ist kein Server ausgewählt.';
    if (error instanceof NetworkError) return 'Der Server ist nicht erreichbar. Bitte prüfe deine Verbindung.';
    return error instanceof Error ? error.message : fallback;
}
