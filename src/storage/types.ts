export type ChatRole = 'owner' | 'member' | 'invited' | 'admin' | 'none';
export type MemberRole = 'owner' | 'member' | 'invited';

export type ChatRow = {
    id: number;
    name: string;
    visibility: 'public' | 'private';
    directchat: boolean;
    role: ChatRole;
    joined: boolean;
    ownerUserid: string | null;
    firstSeenAt: number;
    missingSince: number | null;
    syncedAt: number;
    polledUpTo: number;
    lastPolledAt: number | null;
};

export type ChatSnapshot = {
    id: number;
    name: string;
    visibility: 'public' | 'private';
    directchat: boolean;
    role: ChatRole;
    joined: boolean;
    ownerUserid: string | null;
    members: { userid: string; role: MemberRole }[];
};

export type ProfileRow = {
    /** Lowercase userid; the mapper lowercases userids before they reach a repository. */
    userid: string;
    hash: string;
    nickname: string | null;
    fullname: string | null;
    fetchedAt: number;
    missingSince: number | null;
};

export type RawMessageInput = {
    id: number;
    userid: string;
    userNick: string | null;
    userFullname: string | null;
    userHash: string | null;
    serverTime: string | null;
    important: boolean;
    text: string | null;
    photoId: string | null;
    fileId: string | null;
    position: string | null;
};

export type RawMessage = RawMessageInput & { chatId: number; receivedAt: number };

export type ServerEntry = { id: string; name: string; url: string };

export type AccountEntry = {
    id: string;
    serverId: string;
    userid: string;
    userHash?: string;
    nickname?: string;
    status: 'active' | 'server_deleted';
    createdAt: number;
    lastLoginAt?: number;
};
