/** @jest-environment node */

import { ApiError, NetworkError } from '../../api/apiClient';
import { getChats } from '../../api/chatService';
import { getMessages } from '../../api/messageService';
import type { Chat, Message, User } from '../../api/types';
import { getProfiles } from '../../api/userService';
import { createSyncApi, isNetworkError } from '../apiAdapter';
import { ChatNotFoundError, InvalidServerDataError, InvalidTokenError } from '../errors';
import type { SyncApi } from '../ports';

jest.mock('../../api/chatService');
jest.mock('../../api/messageService');
jest.mock('../../api/userService');

const chatsMock = jest.mocked(getChats);
const profilesMock = jest.mocked(getProfiles);
const messagesMock = jest.mocked(getMessages);

const user: User = { hash: 'h1', nickname: 'Luka', fullname: 'Luka', userid: 'LUWEIT01' };
const chat: Chat = {
    chatid: 1, chatname: 'refactor', visibility: 'private', role: 'owner', joined: true, directchat: false,
    owner: user, participants: [user], invited: [],
};
const message: Message = {
    id: 1, userid: 'LUWEIT01', time: '2026-10-26_13-29-49', chatid: 1, important: false, text: 'hi',
    photoid: null, fileid: null, usernick: 'Luka', userhash: 'h1', userfullname: 'Luka',
};

beforeEach(() => {
    jest.resetAllMocks();
    chatsMock.mockResolvedValue([chat]);
    profilesMock.mockResolvedValue([user]);
    messagesMock.mockResolvedValue([message]);
});

type Method = 'getChats' | 'getProfiles' | 'getMessages';
const methods: Method[] = ['getChats', 'getProfiles', 'getMessages'];
const failWith = (method: Method, error: Error) => {
    if (method === 'getChats') chatsMock.mockRejectedValue(error);
    else if (method === 'getProfiles') profilesMock.mockRejectedValue(error);
    else messagesMock.mockRejectedValue(error);
};
const invoke = (api: SyncApi, method: Method): Promise<unknown> =>
    method === 'getChats' ? api.getChats()
        : method === 'getProfiles' ? api.getProfiles()
            : api.getMessages(3, 7);

describe('createSyncApi', () => {
    it('passes useAdminKey false in all three calls', async () => {
        const api = createSyncApi();
        await api.getChats();
        await api.getProfiles();
        await api.getMessages(3, 7);
        expect(chatsMock).toHaveBeenCalledWith(false);
        expect(profilesMock).toHaveBeenCalledWith(false);
        expect(messagesMock).toHaveBeenCalledWith({ fromid: 7, chatid: 3, useAdminKey: false });
    });

    it('returns mapped domain data with lowercase userids', async () => {
        const api = createSyncApi();
        expect(await api.getChats()).toEqual([{
            id: 1, name: 'refactor', visibility: 'private', directchat: false, role: 'owner', joined: true,
            ownerUserid: 'luweit01', members: [{ userid: 'luweit01', role: 'owner' }],
        }]);
        expect(await api.getProfiles()).toEqual([{ userid: 'luweit01', hash: 'h1', nickname: 'Luka', fullname: 'Luka' }]);
        expect(await api.getMessages(1, 0)).toMatchObject([{ id: 1, userid: 'luweit01', text: 'hi', serverTime: '2026-10-26_13-29-49' }]);
    });

    it.each(methods)('maps ApiError 456 from %s to InvalidTokenError without the server text', async (method) => {
        failWith(method, new ApiError(456, 'secret server text'));
        const error = await invoke(createSyncApi(), method).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(InvalidTokenError);
        expect((error as Error).message).not.toContain('secret');
    });

    it('maps ApiError 458 to ChatNotFoundError for getMessages only', async () => {
        failWith('getMessages', new ApiError(458, 'Invalid chatid: 3'));
        await expect(createSyncApi().getMessages(3, 0)).rejects.toBeInstanceOf(ChatNotFoundError);

        const chatsError = new ApiError(458, 'x');
        chatsMock.mockRejectedValue(chatsError);
        await expect(createSyncApi().getChats()).rejects.toBe(chatsError);
        const profilesError = new ApiError(458, 'x');
        profilesMock.mockRejectedValue(profilesError);
        await expect(createSyncApi().getProfiles()).rejects.toBe(profilesError);
    });

    it.each(methods)('passes NetworkError and other ApiErrors from %s through unchanged', async (method) => {
        const network = new NetworkError();
        failWith(method, network);
        await expect(invoke(createSyncApi(), method)).rejects.toBe(network);
        const other = new ApiError(500, 'server broke');
        failWith(method, other);
        await expect(invoke(createSyncApi(), method)).rejects.toBe(other);
    });

    it('recognizes NetworkError with isNetworkError', () => {
        expect(isNetworkError(new NetworkError())).toBe(true);
        expect(isNetworkError(new Error('x'))).toBe(false);
        expect(isNetworkError(new ApiError(456, 'x'))).toBe(false);
    });

    it('rejects an invalid chats payload with InvalidServerDataError', async () => {
        chatsMock.mockResolvedValue([chat, { chatname: 'no id' } as unknown as Chat]);
        await expect(createSyncApi().getChats()).rejects.toBeInstanceOf(InvalidServerDataError);
        chatsMock.mockResolvedValue(undefined as unknown as Chat[]);
        await expect(createSyncApi().getChats()).rejects.toBeInstanceOf(InvalidServerDataError);
    });

    it('rejects an invalid messages payload with InvalidServerDataError', async () => {
        messagesMock.mockResolvedValue([message, { ...message, id: 0 }]);
        await expect(createSyncApi().getMessages(1, 0)).rejects.toBeInstanceOf(InvalidServerDataError);
    });

    it('drops invalid profile entries individually and reports their count', async () => {
        profilesMock.mockResolvedValue([user, { userid: 'x' } as unknown as User, { ...user, userid: 'JANHIT00', hash: 'h2' }]);
        const onProfilesDropped = jest.fn();
        const profiles = await createSyncApi({ onProfilesDropped }).getProfiles();
        expect(profiles.map(profile => profile.userid)).toEqual(['luweit01', 'janhit00']);
        expect(onProfilesDropped).toHaveBeenCalledTimes(1);
        expect(onProfilesDropped).toHaveBeenCalledWith(1);
    });

    it('does not report dropped profiles when all are valid, and rejects a non-array profiles payload', async () => {
        const onProfilesDropped = jest.fn();
        await createSyncApi({ onProfilesDropped }).getProfiles();
        expect(onProfilesDropped).not.toHaveBeenCalled();
        profilesMock.mockResolvedValue(undefined as unknown as User[]);
        await expect(createSyncApi().getProfiles()).rejects.toBeInstanceOf(InvalidServerDataError);
    });
});
