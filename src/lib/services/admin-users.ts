/**
 * 後台管理員：ADMIN_EMAILS 裡的帳號是「總管理員」（不能在後台移除），
 * 其他管理員存在 admin_users 資料表，由總管理員在「管理員設定」新增或移除。
 */
import { asc, eq, inArray } from 'drizzle-orm';
import { getDb } from '../db/client';
import { adminUsers, user } from '../db/schema';
import { getAdminEmails } from '../auth/admin';

export type AdminRole = 'owner' | 'staff';

export type AdminListItem = {
	email: string;
	role: AdminRole;
	note: string | null;
	name: string | null;
	hasAccount: boolean;
	createdAt: Date | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 每個請求都會檢查，短暫快取；新增或移除後立即清掉 */
const CACHE_MS = 30_000;
let cache: { at: number; emails: Set<string> } | null = null;

function normalize(email: string): string {
	return email.trim().toLowerCase();
}

async function staffEmails(): Promise<Set<string>> {
	if (cache && Date.now() - cache.at < CACHE_MS) return cache.emails;
	try {
		const rows = await getDb().select({ email: adminUsers.email }).from(adminUsers);
		cache = { at: Date.now(), emails: new Set(rows.map((row) => row.email)) };
	} catch {
		// 資料表還沒建立或暫時連不上：沿用上次結果，沒有就只認總管理員
		cache = { at: Date.now() - CACHE_MS + 5_000, emails: cache?.emails ?? new Set() };
	}
	return cache.emails;
}

export async function getAdminRole(email: string | null | undefined): Promise<AdminRole | null> {
	if (!email) return null;
	const target = normalize(email);
	if (getAdminEmails().includes(target)) return 'owner';
	return (await staffEmails()).has(target) ? 'staff' : null;
}

export async function listAdmins(): Promise<AdminListItem[]> {
	const db = getDb();
	const owners = getAdminEmails();
	const staff = await db.select().from(adminUsers).orderBy(asc(adminUsers.createdAt));
	const emails = [...owners, ...staff.map((row) => row.email)];
	const accounts = emails.length
		? await db.select({ email: user.email, name: user.name }).from(user).where(inArray(user.email, emails))
		: [];
	const accountByEmail = new Map(accounts.map((row) => [normalize(row.email), row]));
	const item = (email: string, role: AdminRole, note: string | null, createdAt: Date | null): AdminListItem => {
		const account = accountByEmail.get(email);
		return { email, role, note, createdAt, name: account?.name ?? null, hasAccount: Boolean(account) };
	};
	return [
		...owners.map((email) => item(email, 'owner', null, null)),
		...staff.filter((row) => !owners.includes(row.email)).map((row) => item(row.email, 'staff', row.note, row.createdAt)),
	];
}

export async function addAdmin(input: { email: string; note?: string; createdBy: string }): Promise<void> {
	const email = normalize(input.email);
	if (!EMAIL_RE.test(email)) throw new Error('請輸入正確的電子郵件');
	if (getAdminEmails().includes(email)) throw new Error('這個帳號已經是總管理員');
	const note = input.note?.trim().slice(0, 40) || null;
	const db = getDb();
	const [existing] = await db.select({ email: adminUsers.email }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
	if (existing) throw new Error('這個帳號已經是管理員');
	await db.insert(adminUsers).values({ email, note, createdBy: normalize(input.createdBy) });
	cache = null;
}

export async function removeAdmin(email: string): Promise<void> {
	const target = normalize(email);
	if (getAdminEmails().includes(target)) throw new Error('總管理員帳號不能在這裡移除');
	await getDb().delete(adminUsers).where(eq(adminUsers.email, target));
	cache = null;
}
