/**
 * 將 V1 Sanity（project iz7fvprm / dataset production）
 * 完整移植到 V2 Sanity（PUBLIC_SANITY_PROJECT_ID / production）。
 *
 * 用法：npm run sanity:migrate-from-v1
 * 需要：
 * - SANITY_V1_TOKEN（可讀 V1；未設則沿用舊預設／或 SANITY_API_TOKEN_V1）
 * - SANITY_API_TOKEN（可寫 V2 新專案）
 */
import { spawnSync } from 'node:child_process';
import { existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve(process.cwd(), '.env') });

const V1_PROJECT = process.env.SANITY_V1_PROJECT_ID || 'iz7fvprm';
const V1_DATASET = process.env.SANITY_V1_DATASET || 'production';
const V2_PROJECT =
	process.env.PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_STUDIO_PROJECT_ID || '';
const V2_DATASET =
	process.env.PUBLIC_SANITY_DATASET || process.env.SANITY_STUDIO_DATASET || 'production';

const v1Token = (
	process.env.SANITY_V1_TOKEN ||
	process.env.SANITY_API_TOKEN_V1 ||
	''
).trim();
const v2Token = (
	process.env.SANITY_AUTH_TOKEN ||
	process.env.SANITY_API_TOKEN ||
	process.env.SANITY_STUDIO_TOKEN ||
	''
).trim();

if (!V2_PROJECT) {
	console.error('缺少 PUBLIC_SANITY_PROJECT_ID（V2 專案）');
	process.exit(1);
}
if (!v2Token) {
	console.error('缺少 SANITY_API_TOKEN（V2 寫入）');
	process.exit(1);
}
if (!v1Token) {
	console.error('缺少 SANITY_V1_TOKEN（讀取 V1 production 用；請在 .env 設定）');
	process.exit(1);
}

const archive = resolve(process.cwd(), '.tmp-sanity-prod-export.tar.gz');

function run(args, token) {
	console.log('>', 'npx', 'sanity', ...args);
	const r = spawnSync('npx', ['--yes', 'sanity@latest', ...args], {
		stdio: 'inherit',
		env: { ...process.env, SANITY_AUTH_TOKEN: token },
		shell: true,
	});
	if (r.status !== 0) process.exit(r.status ?? 1);
}

try {
	if (existsSync(archive)) unlinkSync(archive);
	run(['dataset', 'export', V1_DATASET, archive, '-p', V1_PROJECT, '--overwrite'], v1Token);
	run(
		[
			'dataset',
			'import',
			archive,
			'--dataset',
			V2_DATASET,
			'-p',
			V2_PROJECT,
			'--replace',
			'--allow-failing-assets',
		],
		v2Token,
	);
	console.log(`\n完成：${V1_PROJECT}/${V1_DATASET} → ${V2_PROJECT}/${V2_DATASET}`);
} finally {
	if (existsSync(archive)) {
		try {
			unlinkSync(archive);
		} catch {
			/* ignore */
		}
	}
}
