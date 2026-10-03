import { createAuthClient } from 'better-auth/client';

/**
 * Browser auth client. Contains no secrets.
 * Points at the same-origin Better Auth handler.
 */
export const authClient = createAuthClient({
	baseURL: typeof window !== 'undefined' ? window.location.origin : undefined,
});
