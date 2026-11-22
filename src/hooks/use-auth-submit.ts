import { describeAuthError } from '@/utils/auth-error';
import { useState } from 'react';

export function useAuthSubmit(fallbackMessage: string) {
    const [error, setError] = useState<string>();
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function submit(action: () => Promise<unknown>, validationError?: string) {
        if (validationError) {
            setError(validationError);
            return;
        }
        setError(undefined);
        setIsSubmitting(true);
        try {
            await action();
        } catch (e) {
            setError(describeAuthError(e, fallbackMessage));
        } finally {
            setIsSubmitting(false);
        }
    }

    return { error, isSubmitting, submit };
}
