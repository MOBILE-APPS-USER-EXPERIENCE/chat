import { BinaryResult, postRequest, request, requestBinary } from './apiClient';
import { Message } from './types';

export async function postMessage(params: {
    text?: string;
    photo?: string;   // base64, with or without data:-Prefix
    file?: string;     // base64, with or without data:-Prefix
    position?: string;
    chatid?: number;
    important?: boolean;
}): Promise<void> {
    await postRequest('postmessage', params);
}

export async function getMessages(params: {
    fromid?: number;
    chatid?: number;
    useAdminKey?: boolean;
} = {}): Promise<Message[]> {
    const res = await request<{ status: 'ok'; code: number; message: string; messages: Message[]; }>(
        'getmessages',
        { fromid: params.fromid, chatid: params.chatid },
        { includeAdminKey: params.useAdminKey ?? true },
    );
    return res.messages;
}

export async function getPhoto(photoid: string): Promise<BinaryResult> {
    return requestBinary('getphoto', { photoid });
}

export async function getFile(fileid: string): Promise<BinaryResult> {
    return requestBinary('getfile', { fileid });
}
