/*
 * 全站共用的頁面內確認彈窗。
 * 系統 confirm()／alert()／prompt() 在 iPhone PWA 與 App 內建瀏覽器可能不會跳出，
 * 會直接當成「取消」，按鈕看起來就像沒反應，所以一律改走這裡。
 *
 * 表單：<form data-confirm="訊息" data-confirm-danger>，由 initConfirmForms 統一攔截。
 * 程式：if (!(await askConfirm('訊息'))) return;
 */
type SheetOptions = { okLabel?: string; cancelLabel?: string; danger?: boolean };
type SheetParts = { dialog: HTMLDialogElement; message: HTMLElement; input: HTMLInputElement; cancel: HTMLButtonElement; ok: HTMLButtonElement };

let parts: SheetParts | null = null;
let settle: ((ok: boolean) => void) | null = null;
/** 表單送出後頁面會跳轉，按下確認時保留彈窗並顯示處理中 */
let holdAfterOk = false;

function finish(ok: boolean) {
	const done = settle;
	settle = null;
	done?.(ok);
}

function getSheet(): SheetParts {
	if (parts?.dialog.isConnected) return parts;
	const dialog = document.createElement('dialog');
	dialog.className = 'confirm-sheet';
	dialog.tabIndex = -1;
	dialog.setAttribute('autofocus', '');
	dialog.setAttribute('aria-labelledby', 'confirm-sheet-message');
	dialog.innerHTML = `<div class="confirm-sheet__body">
		<p id="confirm-sheet-message" class="confirm-sheet__message"></p>
		<input class="confirm-sheet__input" type="text" autocomplete="off" aria-labelledby="confirm-sheet-message" hidden />
		<div class="confirm-sheet__actions">
			<button type="button" class="confirm-sheet__cancel"></button>
			<button type="button" class="confirm-sheet__ok"></button>
		</div>
	</div>`;
	document.body.append(dialog);
	const sheet: SheetParts = {
		dialog,
		message: dialog.querySelector('.confirm-sheet__message')!,
		input: dialog.querySelector('.confirm-sheet__input')!,
		cancel: dialog.querySelector('.confirm-sheet__cancel')!,
		ok: dialog.querySelector('.confirm-sheet__ok')!,
	};
	sheet.cancel.addEventListener('click', () => dialog.close());
	sheet.ok.addEventListener('click', () => {
		if (holdAfterOk) {
			sheet.ok.disabled = true;
			sheet.cancel.disabled = true;
			sheet.ok.textContent = '處理中…';
			finish(true);
			return;
		}
		finish(true);
		dialog.close();
	});
	sheet.input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && !event.isComposing) sheet.ok.click();
	});
	// 內容都包在 __body 裡，點到 dialog 本身就是點到背景
	dialog.addEventListener('click', (event) => {
		if (event.target === dialog && !sheet.ok.disabled) dialog.close();
	});
	dialog.addEventListener('close', () => finish(false));
	parts = sheet;
	return sheet;
}

function openSheet(message: string, options: SheetOptions & { hideCancel?: boolean; hold?: boolean; value?: string }): Promise<boolean> {
	const sheet = getSheet();
	if (typeof sheet.dialog.showModal !== 'function') return Promise.resolve(window.confirm(message)); // iOS 15.4 以前沒有 dialog
	finish(false);
	holdAfterOk = Boolean(options.hold);
	// 程式碼縮排帶進來的空白不要顯示
	sheet.message.textContent = message.split('\n').map((line) => line.trim()).join('\n');
	sheet.input.hidden = options.value === undefined;
	sheet.input.value = options.value ?? '';
	sheet.cancel.hidden = Boolean(options.hideCancel);
	sheet.cancel.disabled = false;
	sheet.cancel.textContent = options.cancelLabel ?? '返回';
	sheet.ok.disabled = false;
	sheet.ok.textContent = options.okLabel ?? '確認';
	sheet.ok.classList.toggle('is-danger', Boolean(options.danger));
	// 危險操作：「返回」放在右邊（手指原本按的位置），確認鍵 1 秒後才能按，避免連點誤觸
	sheet.dialog.classList.toggle('is-danger', Boolean(options.danger));
	if (options.danger) {
		sheet.ok.disabled = true;
		window.setTimeout(() => { if (settle) sheet.ok.disabled = false; }, 1000);
	}
	return new Promise((resolve) => {
		settle = resolve;
		if (!sheet.dialog.open) sheet.dialog.showModal();
		if (options.value !== undefined) sheet.input.focus();
	});
}

/** 請使用者確認；按確認回傳 true，按返回、點背景或 Esc 回傳 false */
export function askConfirm(message: string, options: SheetOptions = {}): Promise<boolean> {
	return openSheet(message, options);
}

/** 只有告知、沒有選擇的訊息 */
export async function showNotice(message: string, okLabel = '知道了'): Promise<void> {
	await openSheet(message, { okLabel, hideCancel: true });
}

/** 請使用者輸入一行文字；取消回傳 null */
export async function askText(message: string, value = '', options: SheetOptions = {}): Promise<string | null> {
	const ok = await openSheet(message, { ...options, value });
	return ok ? getSheet().input.value : null;
}

/** 攔截所有 form[data-confirm]，確認後才真正送出 */
export function initConfirmForms() {
	document.addEventListener('submit', (event) => {
		const form = event.target;
		if (!(form instanceof HTMLFormElement) || !form.dataset.confirm) return;
		if (form.dataset.confirmed === '1') {
			delete form.dataset.confirmed;
			return;
		}
		event.preventDefault();
		event.stopImmediatePropagation();
		const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
		const okLabel = (submitter ?? form.querySelector('button[type=submit]'))?.textContent?.trim() || '確認';
		void openSheet(form.dataset.confirm, { okLabel, danger: form.hasAttribute('data-confirm-danger'), hold: true }).then((ok) => {
			if (!ok) return;
			form.dataset.confirmed = '1';
			form.requestSubmit(submitter);
		});
	}, true);
	// 從下一頁按返回時，頁面可能帶著「處理中」的彈窗被還原
	window.addEventListener('pageshow', (event) => {
		if (event.persisted) parts?.dialog.close();
	});
}
