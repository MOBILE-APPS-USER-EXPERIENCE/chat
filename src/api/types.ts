export type User = {
    hash: string;
    nickname: string;
    fullname: string;
    userid: string;
};

export type Chat = {
    chatid: number;
    chatname: string;
    visibility: 'public' | 'private';
    role: 'owner' | 'member' | 'invited' | 'admin' | 'none';
    joined: boolean;
    directchat: boolean;
    owner: User | [];
    participants: User[];
    invited?: User[]; // missing in main chat
};

export type Message = {
    id: number;
    userid: string;
    time: string;
    chatid: number;
    important: boolean;
    text?: string;
    photoid?: string | null;
    fileid?: string | null;
    position?: string; // geolocation position in format "{lat: <lat>, lon: <lon>}"
    usernick: string;
    userhash: string;
    userfullname: string;
    username?: string; // only with admin key
};

export type Invite = {
    chatid: number;
    chatname: string;
    directchat: boolean;
    owner?: User;
};
