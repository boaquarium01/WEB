import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Cloudflare Workers 不允許跨請求重用資料庫連線，
 * 所以資料庫與 Better Auth 實例都放在「每次請求」的範圍內。
 * 在這個範圍外（tsx／drizzle 指令）仍使用單一全域連線。
 */
export type RequestScope = {
	/** Hyperdrive 連線字串；未綁定時使用 DATABASE_URL */
	databaseUrl?: string;
	db?: unknown;
	auth?: unknown;
};

const storage = new AsyncLocalStorage<RequestScope>();

export function runInRequestScope<T>(scope: RequestScope, fn: () => T): T {
	return storage.run(scope, fn);
}

export function getRequestScope(): RequestScope | undefined {
	return storage.getStore();
}
