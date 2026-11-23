/** @jest-environment node */

import { InvalidServerDataError } from '../errors';
import {
    toChatSnapshot, toChatSnapshots, toProfileInput, toProfileInputs, toRawMessageInput, toRawMessageInputs,
} from '../mappers';

// Real responses (see the task description).
const luka = { hash: 'hS7RScFx', nickname: 'Luka', fullname: 'Luka', userid: 'luweit01' };
const luka2 = { hash: 'Wr0kFZnX', nickname: 'Luka 2', fullname: 'Luka der Zweite', userid: 'luweit02' };
const jan = { hash: 'NEWnhN5j', nickname: 'Jan', fullname: 'Jan', userid: 'jaehit00' };

const REAL_CHATS = [
    { chatid: 0, chatname: 'Main Chat', visibility: 'public', role: 'member', joined: true, directchat: false, owner: [], participants: [] },
    { chatid: 1, chatname: 'refactor', visibility: 'private', role: 'owner', joined: true, directchat: false, owner: luka, participants: [luka], invited: [] },
    { chatid: 2, chatname: 'refactor invited', visibility: 'private', role: 'invited', joined: false, directchat: false, owner: luka2, participants: [luka2], invited: [luka] },
    { chatid: 4, chatname: 'WS26:MOD:Mathe_1:MAIN', visibility: 'public', role: 'none', joined: false, directchat: false, owner: jan, participants: [jan], invited: [] },
];

const REAL_MESSAGE = {
    id: 1, userid: 'luweit01', time: '2026-10-26_13-29-49', chatid: 0, important: false, photoid: null,
    fileid: null, usernick: 'Luka', userhash: 'VQDf08LE', userfullname: 'Luka', text: 'Hello everyone',
};

const chat = (overrides: Record<string, unknown> = {}) => ({
    chatid: 3, chatname: 'Team', visibility: 'private', role: 'member', joined: true, directchat: false,
    owner: { ...luka }, participants: [{ ...luka }], invited: [], ...overrides,
});

function thrown(action: () => unknown): unknown {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error('Expected the call to throw');
}

describe('toChatSnapshot', () => {
    it('maps the real getchats response', () => {
        expect(toChatSnapshots(REAL_CHATS)).toEqual([
            { id: 0, name: 'Main Chat', visibility: 'public', directchat: false, role: 'member', joined: true, ownerUserid: null, members: [] },
            {
                id: 1, name: 'refactor', visibility: 'private', directchat: false, role: 'owner', joined: true,
                ownerUserid: 'luweit01', members: [{ userid: 'luweit01', role: 'owner' }],
            },
            {
                id: 2, name: 'refactor invited', visibility: 'private', directchat: false, role: 'invited', joined: false,
                ownerUserid: 'luweit02',
                members: [{ userid: 'luweit02', role: 'owner' }, { userid: 'luweit01', role: 'invited' }],
            },
            {
                id: 4, name: 'WS26:MOD:Mathe_1:MAIN', visibility: 'public', directchat: false, role: 'none', joined: false,
                ownerUserid: 'jaehit00', members: [{ userid: 'jaehit00', role: 'owner' }],
            },
        ]);
    });

    it('maps an owner of [] to ownerUserid null and no members', () => {
        expect(toChatSnapshot(chat({ owner: [], participants: [] }))).toMatchObject({ ownerUserid: null, members: [] });
    });

    it('maps owner and plain participants to owner and member', () => {
        const snapshot = toChatSnapshot(chat({ participants: [luka, luka2] }));
        expect(snapshot.members).toEqual([{ userid: 'luweit01', role: 'owner' }, { userid: 'luweit02', role: 'member' }]);
    });

    it('lists an owner that is also in participants once, as owner', () => {
        const snapshot = toChatSnapshot(chat({ participants: [luka, luka] }));
        expect(snapshot.members).toEqual([{ userid: 'luweit01', role: 'owner' }]);
    });

    it('adds the owner as member row even if participants omits them', () => {
        const snapshot = toChatSnapshot(chat({ participants: [luka2] }));
        expect(snapshot.members).toEqual([{ userid: 'luweit01', role: 'owner' }, { userid: 'luweit02', role: 'member' }]);
    });

    it('lets member win over invited for a user listed in both', () => {
        const snapshot = toChatSnapshot(chat({ participants: [luka, luka2], invited: [luka2] }));
        expect(snapshot.members).toEqual([{ userid: 'luweit01', role: 'owner' }, { userid: 'luweit02', role: 'member' }]);
    });

    it('lets owner win over invited', () => {
        const snapshot = toChatSnapshot(chat({ invited: [luka] }));
        expect(snapshot.members).toEqual([{ userid: 'luweit01', role: 'owner' }]);
    });

    it('maps invited entries to invited', () => {
        const snapshot = toChatSnapshot(chat({ invited: [luka2, luka2] }));
        expect(snapshot.members).toEqual([{ userid: 'luweit01', role: 'owner' }, { userid: 'luweit02', role: 'invited' }]);
    });

    it('accepts a missing invited key', () => {
        const { invited: _omitted, ...withoutInvited } = chat();
        void _omitted;
        expect(toChatSnapshot(withoutInvited).members).toEqual([{ userid: 'luweit01', role: 'owner' }]);
    });

    it('gives the main chat no members', () => {
        const snapshot = toChatSnapshot(chat({ chatid: 0, owner: [], participants: [luka], invited: [luka2] }));
        expect(snapshot.members).toEqual([]);
    });

    it('lowercases all userids', () => {
        const upper = (user: typeof luka) => ({ ...user, userid: user.userid.toUpperCase() });
        const snapshot = toChatSnapshot(chat({ owner: upper(luka), participants: [upper(luka), upper(luka2)], invited: [upper(jan)] }));
        expect(snapshot.ownerUserid).toBe('luweit01');
        expect(snapshot.members).toEqual([
            { userid: 'luweit01', role: 'owner' }, { userid: 'luweit02', role: 'member' }, { userid: 'jaehit00', role: 'invited' },
        ]);
    });

    it('passes role, joined, visibility, directchat and name through', () => {
        expect(toChatSnapshot(chat({ role: 'admin', joined: false, visibility: 'public', directchat: true, chatname: '' })))
            .toMatchObject({ role: 'admin', joined: false, visibility: 'public', directchat: true, name: '' });
    });

    it.each(['superuser', undefined, 5, null])('maps the unknown role %p to none', (role) => {
        expect(toChatSnapshot(chat({ role })).role).toBe('none');
    });

    it.each([undefined, null, '1', 1.5, NaN, Infinity, -1])('rejects the chatid %p', (chatid) => {
        expect(() => toChatSnapshot(chat({ chatid }))).toThrow(InvalidServerDataError);
    });

    it.each([undefined, 5, null])('rejects the chatname %p', (chatname) => {
        expect(() => toChatSnapshot(chat({ chatname }))).toThrow(InvalidServerDataError);
    });

    it.each(['hidden', undefined, 'PUBLIC'])('rejects the visibility %p', (visibility) => {
        expect(() => toChatSnapshot(chat({ visibility }))).toThrow(InvalidServerDataError);
    });

    it.each([null, 'chat', 5, []])('rejects the non-object chat %p', (value) => {
        expect(() => toChatSnapshot(value)).toThrow(InvalidServerDataError);
    });

    it('rejects participants or owner entries without a userid and a non-array participants list', () => {
        expect(() => toChatSnapshot(chat({ participants: [{ hash: 'x' }] }))).toThrow(InvalidServerDataError);
        expect(() => toChatSnapshot(chat({ owner: { hash: 'x' } }))).toThrow(InvalidServerDataError);
        expect(() => toChatSnapshot(chat({ owner: 'luweit01' }))).toThrow(InvalidServerDataError);
        expect(() => toChatSnapshot(chat({ participants: 'x' }))).toThrow(InvalidServerDataError);
        expect(() => toChatSnapshot(chat({ invited: [null] }))).toThrow(InvalidServerDataError);
    });

    it('names the field but never the data in the error message', () => {
        const error = thrown(() => toChatSnapshot(chat({ chatname: 'secret-name', visibility: 'hidden' })));
        expect(error).toBeInstanceOf(InvalidServerDataError);
        expect((error as Error).message).toContain('visibility');
        expect((error as Error).message).not.toContain('secret-name');
    });

    it('rejects the whole payload when one chat is invalid or the payload is not an array', () => {
        expect(() => toChatSnapshots([chat(), chat({ chatid: 'x' })])).toThrow(InvalidServerDataError);
        expect(() => toChatSnapshots({})).toThrow(InvalidServerDataError);
        expect(() => toChatSnapshots(undefined)).toThrow(InvalidServerDataError);
    });
});

describe('toProfileInput', () => {
    it('maps the real getprofiles response', () => {
        const result = toProfileInputs([jan, luka, luka2]);
        expect(result.dropped).toBe(0);
        expect(result.profiles).toEqual([
            { userid: 'jaehit00', hash: 'NEWnhN5j', nickname: 'Jan', fullname: 'Jan' },
            { userid: 'luweit01', hash: 'hS7RScFx', nickname: 'Luka', fullname: 'Luka' },
            { userid: 'luweit02', hash: 'Wr0kFZnX', nickname: 'Luka 2', fullname: 'Luka der Zweite' },
        ]);
    });

    it('lowercases the userid but keeps the hash as is', () => {
        expect(toProfileInput({ ...luka, userid: 'LUWEIT01', hash: 'AbC' })).toMatchObject({ userid: 'luweit01', hash: 'AbC' });
    });

    it.each([undefined, '', null])('maps the nickname/fullname %p to null', (value) => {
        expect(toProfileInput({ ...luka, nickname: value, fullname: value })).toMatchObject({ nickname: null, fullname: null });
    });

    it('maps missing nickname and fullname keys to null', () => {
        expect(toProfileInput({ userid: 'a', hash: 'h' })).toEqual({ userid: 'a', hash: 'h', nickname: null, fullname: null });
    });

    it.each([
        ['missing hash', { userid: 'a' }],
        ['empty hash', { userid: 'a', hash: '' }],
        ['missing userid', { hash: 'h' }],
        ['empty userid', { userid: '', hash: 'h' }],
        ['non-string hash', { userid: 'a', hash: 5 }],
        ['non-object', 'a'],
    ])('rejects %s', (_label, value) => {
        expect(() => toProfileInput(value)).toThrow(InvalidServerDataError);
    });

    it('drops invalid entries individually and counts them', () => {
        const result = toProfileInputs([jan, { userid: 'x' }, null, luka]);
        expect(result.profiles.map(profile => profile.userid)).toEqual(['jaehit00', 'luweit01']);
        expect(result.dropped).toBe(2);
    });

    it('rejects a payload that is not an array', () => {
        expect(() => toProfileInputs({ profiles: [] })).toThrow(InvalidServerDataError);
    });
});

describe('toRawMessageInput', () => {
    const base = { id: 7, userid: 'ABCDit01', time: '2026-10-26_13-29-49', chatid: 0, important: false, text: 't' };

    it('maps the real getmessages entry', () => {
        expect(toRawMessageInput(REAL_MESSAGE)).toEqual({
            id: 1, userid: 'luweit01', userNick: 'Luka', userFullname: 'Luka', userHash: 'VQDf08LE',
            serverTime: '2026-10-26_13-29-49', important: false, text: 'Hello everyone',
            sentAt: Date.UTC(2026, 9, 26, 12, 29, 49),
            photoId: null, fileId: null, position: null,
        });
    });

    it('lowercases the userid and maps time to serverTime', () => {
        expect(toRawMessageInput(base)).toMatchObject({ userid: 'abcdit01', serverTime: '2026-10-26_13-29-49' });
    });

    it('fills sentAt and returns null for unparseable time', () => {
        expect(toRawMessageInput({ ...base, time: '2026-10-26_13-29-49' }, 'Europe/Berlin').sentAt)
            .toBe(Date.UTC(2026, 9, 26, 12, 29, 49));
        expect(toRawMessageInput({ ...base, time: '2026-02-30_13-29-49' }, 'Europe/Berlin').sentAt)
            .toBeNull();
    });

    it('maps a missing text to null and keeps an empty text', () => {
        const { text: _omitted, ...withoutText } = base;
        void _omitted;
        expect(toRawMessageInput(withoutText).text).toBeNull();
        expect(toRawMessageInput({ ...base, text: '' }).text).toBe('');
    });

    it('does not touch the text: no entity decoding, no trimming', () => {
        const text = '  He said &quot;hi&quot; &amp; left\n<b>x</b> ';
        expect(toRawMessageInput({ ...base, text }).text).toBe(text);
    });

    it('maps missing or undefined optionals to null', () => {
        const minimal = toRawMessageInput({ id: 1, userid: 'a' });
        expect(minimal).toEqual({
            id: 1, userid: 'a', userNick: null, userFullname: null, userHash: null, serverTime: null,
            sentAt: null, important: false, text: null, photoId: null, fileId: null, position: null,
        });
        expect(toRawMessageInput({ ...base, photoid: undefined, fileid: undefined, position: undefined, usernick: undefined }))
            .toMatchObject({ photoId: null, fileId: null, position: null, userNick: null });
    });

    it('keeps optional values that are present', () => {
        expect(toRawMessageInput({ ...base, photoid: 'p', fileid: 'f', position: '{lat: 1, lon: 2}', usernick: 'n', userfullname: 'F', userhash: 'h' }))
            .toMatchObject({ photoId: 'p', fileId: 'f', position: '{lat: 1, lon: 2}', userNick: 'n', userFullname: 'F', userHash: 'h' });
    });

    it.each([
        [true, true], [1, true], ['true', true], ['1', true],
        [false, false], [0, false], ['false', false], ['0', false], ['yes', false], ['TRUE', false],
        [2, false], [null, false], [undefined, false],
    ])('coerces important %p to %p', (value, expected) => {
        expect(toRawMessageInput({ ...base, important: value }).important).toBe(expected);
    });

    it.each([0, -1, 1.5, '1', NaN, Infinity, null, undefined])('rejects the id %p', (id) => {
        expect(() => toRawMessageInput({ ...base, id })).toThrow(InvalidServerDataError);
    });

    it.each([undefined, '', 5, null])('rejects the userid %p', (userid) => {
        expect(() => toRawMessageInput({ ...base, userid })).toThrow(InvalidServerDataError);
    });

    it('rejects non-object input and optional fields of the wrong type', () => {
        expect(() => toRawMessageInput('x')).toThrow(InvalidServerDataError);
        expect(() => toRawMessageInput({ ...base, text: 5 })).toThrow(InvalidServerDataError);
        expect(() => toRawMessageInput({ ...base, photoid: 5 })).toThrow(InvalidServerDataError);
    });

    it('never puts message text into an error message', () => {
        const error = thrown(() => toRawMessageInput({ ...base, id: 0, text: 'secret message text' }));
        expect((error as Error).message).not.toContain('secret message text');
    });

    it('sorts a payload by id and rejects it entirely when one entry is invalid', () => {
        expect(toRawMessageInputs([{ ...base, id: 3 }, { ...base, id: 1 }]).map(message => message.id)).toEqual([1, 3]);
        expect(() => toRawMessageInputs([base, { ...base, id: 0 }])).toThrow(InvalidServerDataError);
        expect(() => toRawMessageInputs(undefined)).toThrow(InvalidServerDataError);
    });
});
