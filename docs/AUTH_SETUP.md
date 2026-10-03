# V2 會員認證設定

本文件只適用 `boaquarium-v2`。使用 V2 專屬資料庫、Better Auth Secret、Google OAuth client、LINE Login channel 與寄信服務；不要把 V1 的憑證或 callback 混用。

## 環境變數

在 V2 的本機、Vercel Preview、Vercel Production 分別設定自己的值：

- `BETTER_AUTH_URL`：該環境可公開連線的正式根網址，不含尾端斜線。
- `BETTER_AUTH_SECRET`：至少 32 字元的隨機伺服器密鑰。
- `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`：Google OAuth Web client。
- `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`：LINE Login channel。
- `GMAIL_API_REFRESH_TOKEN`、`GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET`、`AUTH_EMAIL_FROM`：使用 Gmail API 寄送驗證信與重設密碼信；郵件 OAuth 只要求 `https://www.googleapis.com/auth/gmail.send`，token 僅能放在伺服器環境變數。
- `RESEND_API_KEY`、`AUTH_EMAIL_FROM`：替代的 Resend 寄信設定，寄件網域須先在 Resend 驗證。
- `DATABASE_URL`：V2 專用 Neon PostgreSQL 連線字串。

Secret 不得使用 `PUBLIC_` 前綴，不要放進程式碼或提交 Git。若寄信變數缺少，Email 註冊會明確停用；不會假稱已寄出驗證信。

## Google Cloud Console

1. 在 Google Cloud 建立 V2 專用 OAuth consent screen，填入品牌與支援聯絡資料。
2. 建立 OAuth Client ID，類型選「Web application」。
3. Authorized JavaScript origins 加入目前 V2 網域，例如 `http://localhost:4321` 和獨立的 V2 production host。
4. Authorized redirect URIs 加入每個環境的精確值：`{BETTER_AUTH_URL}/api/auth/callback/google`。localhost 測試也使用此路徑。
5. 將 client ID/secret 分別填入各環境 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`。
6. Vercel Preview 使用有固定網域的 Preview alias，並在 Google Console 登記該精確 redirect URI；不要把 V1 網域列入 V2 client。

## LINE Developers Console

1. 建立 V2 專用 Provider 與 LINE Login channel，平台選 Web app。
2. Channel settings 的 Callback URL 登記精確網址 `{BETTER_AUTH_URL}/api/auth/callback/line`。每個 Preview host 都必須明確登記；若 LINE channel 不接受該 host，使用固定 V2 測試網域。
3. 啟用基本 LINE Login / OpenID Connect 權限；本整合只要求 `openid` 與 `profile`，不要求 Email 權限。
4. 將 Channel ID、Channel secret 填入 `LINE_CHANNEL_ID`、`LINE_CHANNEL_SECRET`。
5. LINE Login 不等於加入 LINE 官方帳號，也不代表同意行銷訊息。本功能不自動加好友、不訂閱推播。

LINE 帳號用 LINE 回傳並由 UserInfo endpoint 驗證的 `sub` 識別，不以 Email、顯示名稱自動合併。無 Email 的 LINE 會員可先完成登入，再於資料補充頁填聯絡資料。

## 郵件服務

本機測試可使用 Gmail API 寄件者 `AUTH_EMAIL_FROM="水博館水族 <boaquarium01@gmail.com>"`，並提供 `GMAIL_API_REFRESH_TOKEN`。Gmail API 僅要求 `gmail.send`，郵件寄送程式不讀取收件匣。Google OAuth 專案處於 Testing 時，非基本登入授權與 refresh token 會在七天後到期；要長期用於會員驗證，需將 Gmail `gmail.send` 敏感權限提交 Google OAuth 驗證。若不希望 Gmail 寄件授權受測試期限影響，請使用已驗證自有網域的 Resend 寄件者，例如 `AUTH_EMAIL_FROM="水博館水族 <auth@example.com>"`，並設定 Resend API key。Email 驗證與重設密碼連結有效一小時。

## Migration

`drizzle/0005_auth_member_security.sql` 只新增會員聯絡 Email、條款同意時間、社群會員補資料狀態、Better Auth database rate-limit table，以及 `(provider_id, account_id)` 唯一索引。它不更新 `user.id`，不更動訂單/地址外鍵。SQL 會先檢查既有重複 OAuth identity；若有重複會中止並要求人工盤點，不會刪除或合併帳號。

先備份 V2 Neon，再檢查 migration SQL 與資料庫連線確定是 V2 後，才由維運人員套用 `npm run db:migrate`。此交付未套用 migration。

## 人工 OAuth 驗收

自動化政策測試與 build 不會模擬 Google/LINE 真實授權。憑證完成後，請逐環境確認：登入/取消、callback 網址、首次使用者建立、既有登入者從「登入與安全」明確綁定、另一個會員已持有 provider identity 時拒絕、解除最後一種登入方式時拒絕，以及 LINE 無 Email 首次登入補資料。不要用相同 Email 來自動合併帳號。
