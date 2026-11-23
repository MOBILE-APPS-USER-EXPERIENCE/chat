import { useSyncExternalStore } from 'react';

import type { SessionState } from './ports';
import { session } from './session';

const SERVER_SNAPSHOT: SessionState = { status: 'initializing' };
const getServerSnapshot = (): SessionState => SERVER_SNAPSHOT;

export function useSession(): SessionState {
    return useSyncExternalStore(session.subscribe, session.getState, getServerSnapshot);
}
