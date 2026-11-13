import { toHTML } from '@portabletext/to-html';
import { urlForImage } from './sanity/image';

const attr = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/**
 * Render Sanity Portable Text body to HTML (server-side).
 */
export function portableTextToHtml(body: unknown[] | null | undefined): string {
	if (!body || body.length === 0) return '';
	try {
		return toHTML(body as Parameters<typeof toHTML>[0], {
			components: {
				types: {
					image: ({ value }) => {
						const builder = urlForImage(value);
						if (!builder) return '';
						const srcset = [600, 1000, 1600].map((w) => `${attr(builder.width(w).auto('format').url())} ${w}w`).join(', ');
						return `<figure class="body-image"><img src="${attr(builder.width(1000).auto('format').url())}" srcset="${srcset}" sizes="(max-width: 760px) 100vw, 720px" alt="" loading="lazy" decoding="async"></figure>`;
					},
				},
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
