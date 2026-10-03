import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';

const envPath = new URL('../.env', import.meta.url);
const redirectUri = 'http://localhost:4317/oauth/callback';
const scope = 'https://www.googleapis.com/auth/gmail.send';
const envText = await readFile(envPath, 'utf8');
const env = parse(envText);
const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env;

if (!clientId || !clientSecret) {
	throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in V2 .env');
}

const state = randomBytes(32).toString('hex');
const expectedState = Buffer.from(state);
const authorizationUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
authorizationUrl.search = new URLSearchParams({
	client_id: clientId,
	redirect_uri: redirectUri,
	response_type: 'code',
	scope,
	access_type: 'offline',
	prompt: 'consent',
	state,
}).toString();

let finished = false;
const server = createServer(async (request, response) => {
	const url = new URL(request.url ?? '/', redirectUri);
	if (url.pathname !== '/oauth/callback') {
		response.writeHead(404).end('Not found');
		return;
	}
	const returnedState = Buffer.from(url.searchParams.get('state') ?? '');
	if (returnedState.length !== expectedState.length || !timingSafeEqual(returnedState, expectedState)) {
		response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('授權驗證失敗，請關閉此頁並重新執行設定。');
		return;
	}
	const oauthError = url.searchParams.get('error');
	if (oauthError) {
		response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Google 授權已取消或失敗，請關閉此頁。');
		finish(new Error('Google authorization was cancelled or denied'));
		return;
	}
	const code = url.searchParams.get('code');
	if (!code) {
		response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('未收到授權碼，請關閉此頁並重新執行設定。');
		return;
	}

	try {
		const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code,
				client_id: clientId,
				client_secret: clientSecret,
				redirect_uri: redirectUri,
				grant_type: 'authorization_code',
			}),
		});
		if (!tokenResponse.ok) throw new Error(`Google token exchange failed (HTTP ${tokenResponse.status})`);
		const tokens = await tokenResponse.json();
		if (!tokens.refresh_token) throw new Error('Google did not return an offline refresh token; revoke the previous V2 grant and retry consent');

		const escapedToken = tokens.refresh_token.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
		const updatedEnv = /^GMAIL_API_REFRESH_TOKEN=.*$/m.test(envText)
			? envText.replace(/^GMAIL_API_REFRESH_TOKEN=.*$/m, `GMAIL_API_REFRESH_TOKEN="${escapedToken}"`)
			: `${envText.trimEnd()}\nGMAIL_API_REFRESH_TOKEN="${escapedToken}"\n`;
		const withSender = /^AUTH_EMAIL_FROM=.*$/m.test(updatedEnv)
			? updatedEnv.replace(/^AUTH_EMAIL_FROM=.*$/m, 'AUTH_EMAIL_FROM="水博館水族 <boaquarium01@gmail.com>"')
			: `${updatedEnv.trimEnd()}\nAUTH_EMAIL_FROM="水博館水族 <boaquarium01@gmail.com>"\n`;
		await writeFile(envPath, withSender, { mode: 0o600 });
		response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<!doctype html><meta charset="utf-8"><title>授權完成</title><p>Gmail 寄信授權已安全儲存。可以關閉此頁。</p>');
		finish();
	} catch (error) {
		response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end('授權設定未完成；請查看本機終端的錯誤訊息。');
		finish(error);
	}
});

function finish(error) {
	if (finished) return;
	finished = true;
	clearTimeout(timeout);
	server.close();
	if (error) {
		console.error(error.message);
		process.exitCode = 1;
	} else {
		console.log('Gmail 寄信授權已儲存至 V2 .env；refresh token 未輸出。');
	}
}

const timeout = setTimeout(() => finish(new Error('Authorization timed out after 10 minutes')), 10 * 60 * 1000);
server.listen(4317, '127.0.0.1', () => {
	console.log('請在目前已登入 boaquarium01@gmail.com 的瀏覽器開啟以下網址，並自行確認 Google 授權：');
	console.log(authorizationUrl.toString());
	console.log(`僅要求 ${scope}；回呼監聽 ${redirectUri}`);
});
