# Vercel 一鍵上線

## 1. 程式碼推到 GitHub

若尚未建立遠端儲存庫：

```bash
# 在專案根目錄（已 commit 後）
git remote add origin https://github.com/你的帳號/你的儲存庫名.git
git branch -M main
git push -u origin main
```

若使用 **GitHub CLI**（已登入 `gh auth login`）：

```bash
gh repo create 你的儲存庫名 --private --source=. --remote=origin --push
```

## 2. 連接 Vercel

1. 登入 [vercel.com](https://vercel.com) → **Add New…** → **Project**
2. **Import** 剛才的 GitHub 儲存庫
3. Framework Preset 會偵測為 **Astro**，維持預設即可：
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. 展開 **Environment Variables**，新增：

| Name | Value | 說明 |
|------|--------|------|
| `PUBLIC_SANITY_PROJECT_ID` | `iz7fvprm`（或你的 ID） | 與本機 `.env` 相同 |
| `PUBLIC_SANITY_DATASET` | `production` | 與 Sanity 專案 dataset 一致 |

5. 按 **Deploy**

> 商品頁為 **建置時** 向 Sanity 拉資料，若未設定上述變數，建置會失敗。

## 3. Sanity CORS（正式網址）

部署完成後，到 [sanity.io/manage](https://www.sanity.io/manage) → 專案 → **API** → **CORS origins**，加入 Vercel 網域，例如：

- `https://你的專案.vercel.app`

（若只用 `npm run studio` 編輯內容，與前台網域無關，但若有開 Presentation / 預覽再補即可。）

## 4. 日後更新

每次 `git push` 到預設分支，Vercel 會自動重新建置與上線。
