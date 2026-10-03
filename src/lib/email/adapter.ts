import { getServerEnv } from '../env';
import { isGmailApiConfigured, sendWithGmailApi } from './gmail';

export type AuthEmailMessage = {
	to: string;
	subject: string;
	text: string;
};

export function isAuthEmailConfigured(): boolean {
	const env = getServerEnv();
	return isGmailApiConfigured(env) || Boolean(env.RESEND_API_KEY && (env.AUTH_EMAIL_FROM || env.PASSWORD_RESET_FROM_EMAIL));
}

/**
 * Replaceable server-only auth email adapter. Returns false when credentials
 * are absent, so callers and screens can avoid claiming that mail was sent.
 */
export async function sendAuthEmail(message: AuthEmailMessage): Promise<boolean> {
	const env = getServerEnv();
	if (isGmailApiConfigured(env)) {
		await sendWithGmailApi(message, env);
		return true;
	}
	const from = env.AUTH_EMAIL_FROM || env.PASSWORD_RESET_FROM_EMAIL;
	if (!env.RESEND_API_KEY || !from) return false;

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ ...message, from, to: [message.to] }),
	});
	if (!response.ok) throw new Error(`郵件服務暫時無法寄送（HTTP ${response.status}）`);
	return true;
}
