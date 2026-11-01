import test from 'node:test';
import assert from 'node:assert/strict';
import { canUnlinkProvider, isSyntheticProviderEmail, passwordProblems, safeLocalRedirect } from './policies.js';

test('redirects accept only same-origin local paths', () => {
	assert.equal(safeLocalRedirect('/account/orders?q=1', 'https://shop.example'), '/account/orders?q=1');
	assert.equal(safeLocalRedirect('//evil.example', 'https://shop.example'), '/account');
	assert.equal(safeLocalRedirect('https://evil.example', 'https://shop.example'), '/account');
});

test('only a non-final social identity can be unlinked', () => {
	assert.equal(canUnlinkProvider('google', 2), true);
	assert.equal(canUnlinkProvider('line', 1), false);
	assert.equal(canUnlinkProvider('credential', 2), false);
});

test('synthetic LINE addresses are not contact addresses', () => {
	assert.equal(isSyntheticProviderEmail('line-abc@line-user.invalid'), true);
	assert.equal(isSyntheticProviderEmail('member@example.com'), false);
});

test('password policy requires length, upper, lower, digit and symbol', () => {
	assert.deepEqual(passwordProblems('Aquarium#2026'), []);
	assert.deepEqual(passwordProblems('aquarium'), ['大寫英文字母', '數字', '特殊符號（如 ! @ # $ %）']);
	assert.equal(passwordProblems('Ab1!').includes('至少 8 碼'), true);
	assert.equal(passwordProblems('Aquarium 2026').includes('特殊符號（如 ! @ # $ %）'), true);
});
