
/** The server reported that the chat does not exist (ApiError 458 from getmessages). */
export class ChatNotFoundError extends Error {
    constructor(message = 'Chat not found') {
        super(message);
        this.name = 'ChatNotFoundError';
    }
}

/** Server data is stale for a join or invite rejection (ApiError 458). */
export class ChatActionRejectedError extends Error {
    constructor(message = 'Chat action rejected') {
        super(message);
        this.name = 'ChatActionRejectedError';
    }
}

/** The token is invalid (ApiError 456): the user has to log in again. */
export class InvalidTokenError extends Error {
    constructor(message = 'Invalid token') {
        super(message);
        this.name = 'InvalidTokenError';
    }
}

/** Server data failed validation. The message names the field only, never the data. */
export class InvalidServerDataError extends Error {
    constructor(message = 'Invalid server data') {
        super(message);
        this.name = 'InvalidServerDataError';
    }
}
