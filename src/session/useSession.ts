import { useSyncExternalStore } from 'react';

import { session } from './index';
import type { SessionState } from './ports';

const SERVER_SNAPSHOT: SessionState = { status: 'initializing' };
const getServerSnapshot = (): SessionState => SERVER_SNAPSHOT;

export function useSession(): SessionState {
    return useSyncExternalStore(session.subscribe, session.getState, getServerSnapshot);
}
