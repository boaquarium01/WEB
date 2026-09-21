# V2 測試站（正式官網完全不動）

| | V1 正式 | V2 測試 |
|--|---------|---------|
| 網址 | https://boaquarium.vercel.app | https://boaquarium-v2-test.vercel.app |
| Git 分支 | `main` | `v2` |
| Vercel 專案 | `web` | `boaquarium-v2-test` |
| Sanity dataset | `production` | `v2`（空資料，慢慢建） |

原則：**只在 `v2` 分支開發與部署**；不要把正式自訂網域綁到 V2 專案。

## 已完成的基礎設施

- Git 分支：`v2`（從當時正式 `main` 切出）
- Sanity dataset：`v2`（public、空內容）
- 本文件與 `.env.v2.example`

## Vercel 專案設定（若尚未完成）

1. 確認遠端已有 `v2` 分支：`git push -u origin v2`
2. [Vercel](https://vercel.com) → **Add New… → Project** → Import `boaquarium01/WEB`
3. 專案名稱：`boaquarium-v2-test`
4. **Production Branch** 設為 `v2`（Settings → Git）
5. Environment Variables（Production / Preview / Development）：

| Name | Value |
|------|--------|
| `PUBLIC_SANITY_PROJECT_ID` | `iz7fvprm` |
| `PUBLIC_SANITY_DATASET` | `v2` |
| `SANITY_STUDIO_PROJECT_ID` | `iz7fvprm` |
| `SANITY_STUDIO_DATASET` | `v2` |
| `SANITY_STUDIO_TOKEN` | （與正式站同一 token 即可） |
| `PUBLIC_SITE_URL` | `https://boaquarium-v2-test.vercel.app` |
| `ADMIN_PATH_SLUG` | V2 專用（與 V1 不同；20–48 字元） |

6. Deploy 後到 [Sanity Manage](https://www.sanity.io/manage/project/iz7fvprm) → **API → CORS origins**，加入：
   - `https://boaquarium-v2-test.vercel.app`

> 正式站 `web` / `main` / `production` **不要改**。

## 本機開發 V2

```bash
# 在 electrical-earth/
cp .env.v2.example .env.v2
# 編輯 .env.v2：填入 token，確認 DATASET=v2

# 暫時把 .env 指到 v2（或手動改 PUBLIC_SANITY_DATASET=v2）
# 然後：
npm run dev
npm run studio
```

Studio 編輯時請確認右上角／設定讀的是 **dataset `v2`**，不要寫進 `production`。

## 日常流程

1. `git checkout v2`
2. 改程式 → `git push origin v2` → V2 自動重新部署
3. 內容在 Sanity `v2` dataset 慢慢建
4. 確認無誤後，再另外規劃如何合併回 `main`（不會自動影響正式站）

## 與正式站對照

- 正式官網：https://boaquarium.vercel.app/
- Sanity 正式內容：dataset `production`
- Sanity Studio 雲端：https://boaquarium.sanity.studio（預設仍連 production；本機 `SANITY_STUDIO_DATASET=v2` 才編 V2）
