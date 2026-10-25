import type { ServerEnv } from '../env';

type GmailMessage = {
	to: string;
	subject: string;
	text: string;
	html?: string;
};

function safeHeader(value: string, label: string): string {
	if (/[\r\n]/.test(value)) throw new Error(`Invalid ${label} email header`);
	return value;
}

function encodeHeader(value: string): string {
	return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function formatFrom(value: string): string {
	const from = safeHeader(value.trim(), 'From');
	const match = from.match(/^(.*?)\s*<([^<>]+)>$/);
	if (!match) return from;
	const displayName = match[1].trim().replace(/^"|"$/g, '');
	const address = match[2].trim();
	return `${displayName ? encodeHeader(displayName) + ' ' : ''}<${address}>`;
}

function toBase64Lines(value: string): string {
	return Buffer.from(value, 'utf8').toString('base64').match(/.{1,76}/g)?.join('\r\n') ?? '';
}

function createRawMessage(message: GmailMessage, from: string): string {
	const to = safeHeader(message.to.trim(), 'To');
	const subject = safeHeader(message.subject, 'Subject');
	const headers = [
		`From: ${formatFrom(from)}`,
		`To: ${to}`,
		`Subject: ${encodeHeader(subject)}`,
		'MIME-Version: 1.0',
	];
	let mime: string;
	if (message.html) {
		const boundary = `----=_Aquarium_${Date.now()}_${Math.random().toString(16).slice(2)}`;
		mime = [
			...headers,
			`Content-Type: multipart/alternative; boundary="${boundary}"`,
			'',
			`--${boundary}`,
			'Content-Type: text/plain; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			toBase64Lines(message.text),
			`--${boundary}`,
			'Content-Type: text/html; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			toBase64Lines(message.html),
			`--${boundary}--`,
		].join('\r\n');
	} else {
		mime = [
			...headers,
			'Content-Type: text/plain; charset=UTF-8',
			'Content-Transfer-Encoding: base64',
			'',
			toBase64Lines(message.text),
		].join('\r\n');
	}
	return Buffer.from(mime, 'utf8').toString('base64url');
}

export function isGmailApiConfigured(env: ServerEnv): boolean {
	return Boolean(
		env.GOOGLE_CLIENT_ID &&
		env.GOOGLE_CLIENT_SECRET &&
		env.GMAIL_API_REFRESH_TOKEN &&
		env.AUTH_EMAIL_FROM,
	);
}

export async function sendWithGmailApi(
	message: GmailMessage,
	env: ServerEnv,
): Promise<void> {
	if (!isGmailApiConfigured(env)) throw new Error('Gmail API mailer is not configured');

	const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID!,
			client_secret: env.GOOGLE_CLIENT_SECRET!,
			refresh_token: env.GMAIL_API_REFRESH_TOKEN!,
			grant_type: 'refresh_token',
		}),
	});
	if (!tokenResponse.ok) {
		throw new Error(`Gmail API authorization failed (HTTP ${tokenResponse.status})`);
	}
	const tokenData = await tokenResponse.json() as { access_token?: string };
	if (!tokenData.access_token) throw new Error('Gmail API authorization returned no access token');

	const sendResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${tokenData.access_token}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ raw: createRawMessage(message, env.AUTH_EMAIL_FROM!) }),
	});
	if (!sendResponse.ok) {
		throw new Error(`Gmail API email delivery failed (HTTP ${sendResponse.status})`);
	}
}
