// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
	output: 'server',
	adapter: vercel(),
	// 本機開發的 Astro 工具列會蓋住手機版底部固定按鈕（只出現在本機，正式站本來就沒有）
	devToolbar: { enabled: false },
	vite: {
		plugins: [tailwindcss()],
	},
});
