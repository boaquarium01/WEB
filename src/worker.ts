/**
 * Cloudflare Worker 入口：一般請求交給 Astro，排程執行逾期訂單取消。
 */
import server from '@astrojs/cloudflare/entrypoints/server';
import { cancelExpiredUnpaidOrders } from './lib/services/admin-orders';
import { runInRequestScope } from './lib/request-scope';

type WorkerEnv = { HYPERDRIVE?: { connectionString: string } };

/** 只有正式網域可被搜尋引擎收錄；測試站與 workers.dev 一律 noindex */
const INDEXABLE_HOSTS = new Set(['boaquarium.com', 'www.boaquarium.com']);

export default {
	async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext) {
		const url = new URL(request.url);
		if (url.pathname === '/robots.txt' && !INDEXABLE_HOSTS.has(url.hostname)) {
			return new Response('User-agent: *\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
		}
		const response = await runInRequestScope({ databaseUrl: env.HYPERDRIVE?.connectionString }, () => server.fetch(request as never, env as never, ctx as never));
		if (INDEXABLE_HOSTS.has(url.hostname)) return response;
		const tagged = new Response(response.body, response);
		tagged.headers.set('X-Robots-Tag', 'noindex, nofollow');
		return tagged;
	},
	scheduled(_controller: ScheduledController, env: WorkerEnv, ctx: ExecutionContext) {
		ctx.waitUntil(
			runInRequestScope({ databaseUrl: env.HYPERDRIVE?.connectionString }, async () => {
				const cancelled = await cancelExpiredUnpaidOrders();
				if (cancelled.length) console.info(`[expire-orders] 已自動取消 ${cancelled.length} 筆：${cancelled.join(', ')}`);
			}),
		);
	},
};
