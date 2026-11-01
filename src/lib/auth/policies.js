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
/** 會員密碼規則（註冊、重設、修改密碼共用；前端清單與伺服器檢查同一份） */
export const PASSWORD_RULES = [
	{ key: 'length', label: '至少 8 碼', test: (/** @type {string} */ v) => v.length >= 8 },
	{ key: 'upper', label: '大寫英文字母', test: (/** @type {string} */ v) => /[A-Z]/.test(v) },
	{ key: 'lower', label: '小寫英文字母', test: (/** @type {string} */ v) => /[a-z]/.test(v) },
	{ key: 'digit', label: '數字', test: (/** @type {string} */ v) => /\d/.test(v) },
	{ key: 'symbol', label: '特殊符號（如 ! @ # $ %）', test: (/** @type {string} */ v) => /[^A-Za-z0-9\s]/.test(v) },
];
/** @param {string} password 回傳未通過的規則說明；空陣列代表合格 */
export function passwordProblems(password) {
	return PASSWORD_RULES.filter((rule) => !rule.test(password)).map((rule) => rule.label);
}
/** @param {string} password */
export function passwordPolicyMessage(password) {
	const missing = passwordProblems(password);
	return missing.length ? `密碼需包含：${missing.join('、')}` : '';
}
