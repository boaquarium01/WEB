/**
 * 會員與訂單郵件的 HTML 版型。每封信同時寄純文字版（multipart/alternative），
 * 不支援 HTML 的信箱會自動顯示純文字。版面只用表格與行內樣式，相容 Gmail／Outlook。
 */
import { getPublicEnv } from '../env';
const formatTwd = (amount: number) => `NT$ ${amount.toLocaleString('zh-TW')}`;

const BRAND = '#156a66';
const BRAND_DARK = '#0f4d4a';
const BRAND_SOFT = '#e8f3f1';
const INK = '#1f2d2c';
const MUTED = '#5f6f6d';
const LINE = '#e3ebe8';
const LINE_URL = 'https://line.me/R/ti/p/@407hrczr?oat_content=url&ts=03301229';
const SHOP_ADDRESS = '桃園市中壢區環西路二段69號';

const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => escapes[c]!);

function siteUrl(): string {
	try {
		return String(getPublicEnv().PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
	} catch {
		return '';
	}
}

/** 共用外框：品牌頁首（logo＋店名）、白色內容卡、頁尾聯絡資訊 */
export function emailLayout(input: { preheader: string; body: string }): string {
	const site = siteUrl();
	const logo = site
		? `<img src="${escapeHtml(site)}/apple-touch-icon.png" width="44" height="44" alt="水博館水族" style="display:block;width:44px;height:44px;border:0;border-radius:12px;">`
		: '';
	return `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>水博館水族</title></head>
<body style="margin:0;padding:0;background:#f3f6f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f6f5;">
<tr><td align="center" style="padding:24px 12px;">
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang TC','Microsoft JhengHei','Noto Sans TC',sans-serif;color:${INK};">
		<tr><td style="background:${BRAND};border-radius:16px 16px 0 0;padding:20px 24px;">
			<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
				${logo ? `<td style="padding-right:12px;vertical-align:middle;">${logo}</td>` : ''}
				<td style="vertical-align:middle;">
					<div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:1px;">水博館水族</div>				</td>
			</tr></table>
		</td></tr>
		<tr><td style="background:#ffffff;padding:28px 24px 24px;border-left:1px solid ${LINE};border-right:1px solid ${LINE};font-size:15px;line-height:1.75;">
			${input.body}
		</td></tr>
		<tr><td style="background:${BRAND_SOFT};border:1px solid ${LINE};border-top:0;border-radius:0 0 16px 16px;padding:16px 24px;font-size:12px;line-height:1.7;color:${MUTED};">
			<strong style="color:${INK};">水博館水族</strong><br>${SHOP_ADDRESS}${site ? `<br><a href="${escapeHtml(site)}" style="color:${BRAND_DARK};text-decoration:none;">${escapeHtml(site.replace(/^https?:\/\//, ''))}</a>` : ''}<br><span style="color:#8a9896;">此信由系統自動寄出，請勿直接回覆。</span>
		</td></tr>
	</table>
</td></tr>
</table>
</body></html>`;
}

const p = (html: string, style = '') => `<p style="margin:0 0 14px;${style}">${html}</p>`;
const h = (text: string) => `<div style="margin:22px 0 10px;padding-left:10px;border-left:4px solid ${BRAND};font-size:16px;font-weight:800;color:${INK};">${escapeHtml(text)}</div>`;
const button = (href: string, label: string) =>
	`<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 6px;"><tr><td style="border-radius:10px;background:${BRAND};"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a></td></tr></table>`;
/** 標題在左、狀態標籤在右，同一列 */
const titleWithTag = (title: string, tag: string, bg: string, fg: string) =>
	`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr><td style="font-size:20px;font-weight:800;color:${INK};vertical-align:middle;">${escapeHtml(title)}</td><td align="right" style="vertical-align:middle;white-space:nowrap;padding-left:10px;"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:${bg};color:${fg};font-size:13px;font-weight:700;">${escapeHtml(tag)}</span></td></tr></table>`;
const infoBox = (rows: [string, string][]) =>
	`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7faf9;border:1px solid ${LINE};border-radius:12px;">${rows
		.map(([label, value], i) => `<tr><td style="padding:10px 14px;${i ? `border-top:1px solid ${LINE};` : ''}font-size:13px;color:${MUTED};white-space:nowrap;vertical-align:top;width:1%;padding-right:2px;">${escapeHtml(label)}</td><td style="padding:10px 14px;${i ? `border-top:1px solid ${LINE};` : ''}font-size:14px;color:${INK};font-weight:600;">${value}</td></tr>`)
		.join('')}</table>`;

export type EmailContent = { subject: string; text: string; html: string };

/** Email 驗證碼 */
export function verificationOtpEmail(otp: string): EmailContent {
	const digits = escapeHtml(otp);
	return {
		subject: `水博館水族驗證碼：${otp}`,
		text: `您好，您的水博館水族驗證碼是：\n\n${otp}\n\n請在 10 分鐘內回到網站輸入，驗證完成後會自動登入。若您沒有註冊，請忽略此信。`,
		html: emailLayout({
			preheader: `您的驗證碼是 ${otp}，10 分鐘內有效`,
			body: [
				p('您好，'),
				p('感謝您註冊水博館水族會員。請在網站輸入下方驗證碼完成 Email 驗證：'),
				`<div style="margin:22px 0;padding:22px 12px;background:${BRAND_SOFT};border:1px dashed ${BRAND};border-radius:14px;text-align:center;">
					<div style="font-size:13px;color:${MUTED};margin-bottom:6px;">您的驗證碼</div>
					<div style="font-family:'SFMono-Regular',Consolas,'Courier New',monospace;font-size:38px;font-weight:800;letter-spacing:10px;color:${BRAND_DARK};">${digits}</div>
					<div style="font-size:12px;color:${MUTED};margin-top:8px;">10 分鐘內有效</div>
				</div>`,
				p('驗證完成後會自動登入。', `color:${MUTED};font-size:14px;`),
				p('若您沒有註冊水博館水族會員，請忽略此信。', `color:${MUTED};font-size:13px;margin:0;`),
			].join(''),
		}),
	};
}

/** 重設密碼 */
export function passwordResetEmail(url: string): EmailContent {
	return {
		subject: '重設您的水博館水族會員密碼',
		text: `您好，我們收到重設水博館水族會員密碼的請求。請點選下方連結，在一小時內設定新密碼：\n\n${url}\n\n若連結已逾期，請重新申請密碼重設。完成重設前，您的原密碼仍可使用。若您未提出此請求，請忽略此信。`,
		html: emailLayout({
			preheader: '點選信中按鈕，在一小時內設定新密碼',
			body: [
				`<div style="font-size:20px;font-weight:800;margin:0 0 12px;">重設會員密碼</div>`,
				p('您好，我們收到重設水博館水族會員密碼的請求。請在 <strong>一小時內</strong> 點選下方按鈕設定新密碼：'),
				button(url, '設定新密碼'),
				p(`按鈕無法點選時，請複製這個網址到瀏覽器開啟：<br><a href="${escapeHtml(url)}" style="color:${BRAND_DARK};word-break:break-all;font-size:13px;">${escapeHtml(url)}</a>`, `color:${MUTED};font-size:13px;margin-top:14px;`),
				p('完成重設前，原密碼仍可使用。若您沒有提出這個請求，請忽略此信。', `color:${MUTED};font-size:13px;margin:0;`),
			].join(''),
		}),
	};
}

export type EmailOrder = {
	orderNumber: string;
	createdAt: Date;
	subtotal: number;
	shippingFee: number;
	discount: number;
	discountCode?: string | null;
	total: number;
	items: { productName: string; skuName: string | null; quantity: number; unitPrice: number; subtotal: number }[];
	shippingAddress: { recipientName: string; phone: string; postalCode: string; city: string; district: string; addressLine: string; shippingMethodName?: string | null };
};

const specOf = (item: EmailOrder['items'][number]) => (item.skuName && item.skuName !== item.productName ? `（${item.skuName}）` : '');
const fullAddress = (a: EmailOrder['shippingAddress']) => `${a.postalCode} ${a.city}${a.district}${a.addressLine}`;
const textItems = (order: EmailOrder) => order.items.map((item) => `• ${item.productName}${specOf(item)} × ${item.quantity}｜單價 ${formatTwd(item.unitPrice)}｜小計 ${formatTwd(item.subtotal)}`);
const textTotals = (order: EmailOrder) => [
	`商品小計：${formatTwd(order.subtotal)}`,
	`運費：${formatTwd(order.shippingFee)}`,
	...(order.discount > 0 ? [`折扣${order.discountCode ? `（${order.discountCode}）` : ''}：-${formatTwd(order.discount)}`] : []),
	`應付總額：${formatTwd(order.total)}`,
];

function htmlItems(order: EmailOrder): string {
	const rows = order.items.map((item) => `<tr>
		<td style="padding:12px 0;border-top:1px solid ${LINE};font-size:14px;vertical-align:top;"><div style="font-weight:700;">${escapeHtml(item.productName)}</div>${specOf(item) ? `<div style="font-size:12px;color:${MUTED};">${escapeHtml(item.skuName ?? '')}</div>` : ''}<div style="font-size:12px;color:${MUTED};">${formatTwd(item.unitPrice)} × ${item.quantity}</div></td>
		<td style="padding:12px 0;border-top:1px solid ${LINE};font-size:14px;font-weight:700;text-align:right;vertical-align:top;white-space:nowrap;">${formatTwd(item.subtotal)}</td>
	</tr>`).join('');
	const line = (label: string, value: string, strong = false) => `<tr><td style="padding:4px 0;font-size:${strong ? 16 : 14}px;color:${strong ? INK : MUTED};${strong ? 'font-weight:800;' : ''}">${label}</td><td style="padding:4px 0;text-align:right;font-size:${strong ? 18 : 14}px;${strong ? `font-weight:800;color:${BRAND_DARK};` : `color:${INK};`}white-space:nowrap;">${value}</td></tr>`;
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
	<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;padding-top:8px;border-top:2px solid ${LINE};">
		${line('商品小計', formatTwd(order.subtotal))}
		${line('運費', formatTwd(order.shippingFee))}
		${order.discount > 0 ? line(`折扣${order.discountCode ? `（${escapeHtml(order.discountCode)}）` : ''}`, `-${formatTwd(order.discount)}`) : ''}
		${line('應付總額', formatTwd(order.total), true)}
	</table>`;
}

/** 訂單成立（銀行轉帳） */
export function orderCreatedEmail(order: EmailOrder, bank: { bankName: string; accountName: string; accountNumber: string }, orderUrl: string): EmailContent {
	const a = order.shippingAddress;
	const created = order.createdAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
	const text = [
		`${a.recipientName}您好，水博館水族訂單已建立`,
		'',
		`訂單編號：${order.orderNumber}`,
		'目前狀態：待付款',
		`應付總額：${formatTwd(order.total)}`,
		`建立時間：${created}`,
		'',
		'【銀行轉帳提醒】',
		`銀行：${bank.bankName}`,
		`戶名：${bank.accountName}`,
		`帳號：${bank.accountNumber}`,
		`應付總額：${formatTwd(order.total)}`,
		`轉帳備註請填訂單編號「${order.orderNumber}」，方便我們核對。`,
		'',
		`完成轉帳後，請前往訂單頁回報轉出帳號末五碼：${orderUrl}`,
		'完成回報後請等候門市核帳，核帳後會更新訂單狀態，無須重複下單。',
		'',
		'【收件資訊】',
		a.recipientName,
		fullAddress(a),
		`電話：${a.phone}`,
		`配送方式：${a.shippingMethodName ?? '依訂單頁面顯示'}`,
		'',
		'【訂單明細】',
		...textItems(order),
		'',
		...textTotals(order),
		'',
		`如對訂單或轉帳有疑問，請洽詢官方賴：${LINE_URL}`,
	].join('\n');
	const html = emailLayout({
		preheader: `訂單 ${order.orderNumber} 已建立，應付 ${formatTwd(order.total)}，請完成轉帳`,
		body: [
			titleWithTag('訂單已建立，感謝您的訂購！', '待付款', '#fff4df', '#9a6510'),
			p(`${escapeHtml(a.recipientName)}您好，以下是您的訂單資訊。`, `color:${MUTED};`),
			infoBox([
				['訂單編號', `<span style="font-family:Consolas,monospace;">${escapeHtml(order.orderNumber)}</span>`],
				['應付總額', `<span style="font-size:18px;color:${BRAND_DARK};">${formatTwd(order.total)}</span>`],
				['建立時間', escapeHtml(created)],
			]),
			h('銀行轉帳'),
			infoBox([
				['銀行', escapeHtml(bank.bankName)],
				['戶名', escapeHtml(bank.accountName)],
				['帳號', `<span style="font-family:Consolas,monospace;font-size:16px;letter-spacing:1px;">${escapeHtml(bank.accountNumber)}</span>`],
				['轉帳備註', `請填訂單編號「${escapeHtml(order.orderNumber)}」`],
			]),
			p('完成轉帳後，請到訂單頁回報轉出帳號末五碼，門市核帳後會更新訂單狀態，不用重複下單。', 'margin-top:14px;'),
			button(orderUrl, '回報轉帳末五碼'),
			h('收件資訊'),
			p(`${escapeHtml(a.recipientName)}｜${escapeHtml(a.phone)}<br>${escapeHtml(fullAddress(a))}<br><span style="color:${MUTED};">配送方式：${escapeHtml(a.shippingMethodName ?? '依訂單頁面顯示')}</span>`),
			h('訂單明細'),
			htmlItems(order),
			p(`如對訂單或轉帳有疑問，請洽詢<a href="${escapeHtml(LINE_URL)}" style="color:${BRAND_DARK};font-weight:700;">官方賴</a>。`, `color:${MUTED};font-size:13px;margin:20px 0 0;`),
		].join(''),
	});
	return { subject: `${a.recipientName}您好，水博館水族訂單已建立｜${order.orderNumber}`, text, html };
}

/** 訂單出貨 */
export function orderShippedEmail(order: EmailOrder, orderUrl: string): EmailContent {
	const a = order.shippingAddress;
	const text = [
		`${a.recipientName}您好：`,
		'',
		`感謝您的訂購！您的訂單 ${order.orderNumber} 已標記出貨。`,
		'商品已交由配送，請留意收件。',
		...(a.shippingMethodName ? [`配送方式：${a.shippingMethodName}`] : []),
		`收件人：${a.recipientName}`,
		`收件地址：${fullAddress(a)}`,
		'',
		'【訂單明細】',
		...textItems(order),
		'',
		...textTotals(order),
		'',
		`查看訂單：${orderUrl}`,
		'',
		'感謝您支持水博館水族，祝您順心！',
	].join('\n');
	const html = emailLayout({
		preheader: `訂單 ${order.orderNumber} 已出貨，請留意收件`,
		body: [
			titleWithTag('您的商品已經出發了 🚚', '已出貨', BRAND_SOFT, BRAND_DARK),
			p(`${escapeHtml(a.recipientName)}您好，訂單 <strong>${escapeHtml(order.orderNumber)}</strong> 已交由配送，請留意收件。`, `color:${MUTED};`),
			infoBox([
				...(a.shippingMethodName ? [['配送方式', escapeHtml(a.shippingMethodName)] as [string, string]] : []),
				['收件人', escapeHtml(a.recipientName)],
				['收件地址', escapeHtml(fullAddress(a))],
			]),
			button(orderUrl, '查看訂單進度'),
			h('訂單明細'),
			htmlItems(order),
			p('感謝您支持水博館水族，祝您順心！', 'margin:20px 0 0;'),
		].join(''),
	});
	return { subject: `${a.recipientName}您好，水博館水族訂單已出貨｜${order.orderNumber}`, text, html };
}
