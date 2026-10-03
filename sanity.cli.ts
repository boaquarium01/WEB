import { defineCliConfig } from 'sanity/cli';

const projectId =
	process.env.SANITY_STUDIO_PROJECT_ID ||
	process.env.PUBLIC_SANITY_PROJECT_ID ||
	'jt3vrzpz';

/** V2 獨立專案；預設 dataset `production` */
const dataset =
	process.env.SANITY_STUDIO_DATASET ||
	process.env.PUBLIC_SANITY_DATASET ||
	'production';

export default defineCliConfig({
	api: {
		projectId,
		dataset,
	},
	/** 部署後網址：https://boaquarium-v2.sanity.studio */
	studioHost: 'boaquarium-v2',
});
