/** @param {string|null|undefined} value @param {string} origin @param {string} [fallback] */
export function safeLocalRedirect(value, origin, fallback = '/account') {
	if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
	try {
		const target = new URL(value, origin);
		return target.origin === origin ? `${target.pathname}${target.search}${target.hash}` : fallback;
	} catch { return fallback; }
}
/** @param {string} providerId @param {number} linkedAccountCount */
export function canUnlinkProvider(providerId, linkedAccountCount) {
	return providerId !== 'credential' && linkedAccountCount > 1;
}
/** @param {string} email */
export function isSyntheticProviderEmail(email) {
	return email.endsWith('@line-user.invalid');
}
