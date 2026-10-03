import { toHTML } from '@portabletext/to-html';

/**
 * Render Sanity Portable Text body to HTML (server-side).
 */
export function portableTextToHtml(body: unknown[] | null | undefined): string {
	if (!body || body.length === 0) return '';
	try {
		return toHTML(body as Parameters<typeof toHTML>[0], {
			components: {
				block: {
					normal: ({ children }) => `<p>${children}</p>`,
					h2: ({ children }) => `<h2>${children}</h2>`,
					h3: ({ children }) => `<h3>${children}</h3>`,
					blockquote: ({ children }) => `<blockquote>${children}</blockquote>`,
				},
				marks: {
					link: ({ children, value }) => {
						const href =
							value && typeof value === 'object' && 'href' in value
								? String((value as { href?: string }).href ?? '#')
								: '#';
						return `<a href="${href}" rel="noopener noreferrer">${children}</a>`;
					},
				},
			},
		});
	} catch {
		return '';
	}
}
