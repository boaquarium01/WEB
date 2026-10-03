/**
 * Admin authorization helpers (email allow-list).
 * ADMIN_EMAILS is comma-separated, server-only.
 */
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: '.env' });

function readAdminEmailsRaw(): string {
	const fromProcess = process.env.ADMIN_EMAILS;
	if (fromProcess && fromProcess.trim()) return fromProcess.trim();
	try {
		const meta = import.meta.env.ADMIN_EMAILS;
		if (typeof meta === 'string' && meta.trim()) return meta.trim();
	} catch {
		/* ignore */
	}
	return '';
}

export function getAdminEmails(): string[] {
	return readAdminEmailsRaw()
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
	if (!email) return false;
	const list = getAdminEmails();
	if (list.length === 0) return false;
	return list.includes(email.trim().toLowerCase());
}
