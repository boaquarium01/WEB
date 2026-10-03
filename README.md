# 水博館 V2（測試版電商）

獨立於 V1（`boaquarium.vercel.app` / `electrical-earth`）的全新專案。  
**不得修改 V1，不得連接 V1 Database。**

## 技術棧

| 層 | 技術 |
|---|---|
| Frontend | Astro + TypeScript (strict) |
| CMS | Sanity（Content Source of Truth） |
| Database | PostgreSQL（Transaction Source of Truth） |
| ORM | Drizzle ORM |
| Auth | Better Auth |
| Deploy | Vercel |

## 目前進度

**Phase 10：Admin Dashboard（已完成）**

- Phase 0–9 ✅  
- Phase 10：Dashboard／Orders／Products／Inventory 後台 ✅  
- 第一階段電商核心流程已齊

### 前台／後台路由

| 路徑 | 說明 |
|------|------|
| `/products` | 本店商品列表 |
| `/product/[slug]` | 商品詳情 |
| `/cart` | 購物車 |
| `/checkout` | 結帳 |
| `/account/orders` | 我的訂單 |
| `/admin/{ADMIN_PATH_SLUG}/dashboard` | **官網內容後台**（Sanity 商品／促銷／分類） |
| `/admin/{ADMIN_PATH_SLUG}/shop` | 電商 Dashboard |
| `/admin/{ADMIN_PATH_SLUG}/shop/orders` | 訂單處理 |
| `/admin/{ADMIN_PATH_SLUG}/shop/products` | PG 商品一覽 |
| `/admin/{ADMIN_PATH_SLUG}/shop/inventory` | 庫存調整 |

```bash
npm run sync:products
npm run db:seed:inventory
```

後台權限：`ADMIN_EMAILS=you@example.com`  
後台路徑：`ADMIN_PATH_SLUG=…` → `/admin/…/dashboard`（內容）與 `/admin/…/shop`（電商）  
內容寫入需 `SANITY_API_TOKEN`。編輯 Sanity 後請 `npm run sync:products` 同步到 PG。  
出貨時會扣減 `on_hand` 與 `reserved` 並寫入 `ONLINE_SALE` movement。

密碼重設：正式環境請設定 `RESEND_API_KEY` 與 `PASSWORD_RESET_FROM_EMAIL`；本機測試未設定時，重設連結會記錄在 Astro 開發伺服器終端。

## 本機啟動

```bash
cp .env.example .env
# 編輯 .env：填入 DATABASE_URL、BETTER_AUTH_SECRET、Sanity 等

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

開啟 [http://localhost:4321](http://localhost:4321)。

### 資料庫

```bash
npm run db:ping       # 驗證 PostgreSQL
npm run db:generate   # 依 schema 產生 migration
npm run db:migrate    # 套用 migration
npm run db:seed       # 建立預設 STORE location
npm run db:studio     # Drizzle Studio
```

### 建置

```bash
npm run build
```

## Phase 1 Tables

| 群組 | Tables |
|---|---|
| Auth (Better Auth) | `user`, `session`, `account`, `verification` |
| Customer | `customers`, `addresses` |
| Product | `products`, `product_skus` |
| Inventory | `locations`, `inventory`, `inventory_movements` |
| Ecommerce | `carts`, `cart_items`, `orders`, `order_items`, `payments`, `payment_submissions` |

**未建立（留給未來 POS / ERP）：** `sales`、`sale_items`、`sale_payments`、`cash_register_sessions`、`suppliers`、採購相關表。

可用庫存：`availableStock = on_hand - reserved`（見 `src/lib/db/inventory.ts`）。  
任何庫存異動必須寫入 `inventory_movements`。

## 環境變數原則

- Secret 只存在 server-side（`DATABASE_URL`、`BETTER_AUTH_SECRET`、Sanity token）
- 禁止 `PUBLIC_DATABASE_URL`、`PUBLIC_BETTER_AUTH_SECRET`、`PUBLIC_SANITY_WRITE_TOKEN`
- Sanity project / dataset 可用 `PUBLIC_`（非 secret）

## 目錄結構

```
src/
  lib/
    auth/          Better Auth（server + browser client）
    db/
      schema/      Drizzle schema（Phase 1）
      client.ts
      inventory.ts
    sanity/        Sanity client + product adapter（Phase 2）
    services/      product-sync 等業務邏輯
    env.ts
  pages/
    api/auth/
    api/health.ts
drizzle/           SQL migrations（已套用 0000）
scripts/
  db-ping.mjs
  seed-locations.mjs   # npm run db:seed
  sync-products.ts     # npm run sync:products
```

## 資料責任

- **Sanity**：商品內容、圖片、分類、SEO、網站文案
- **PostgreSQL**：會員、SKU、價格、庫存、購物車、訂單、付款、庫存異動

## Scripts

| 指令 | 說明 |
|---|---|
| `npm run dev` | 開發伺服器 |
| `npm run build` | 正式建置 |
| `npm run db:ping` | 測試 PostgreSQL 連線 |
| `npm run db:generate` | 產生 migration |
| `npm run db:migrate` | 套用 migration |
| `npm run db:seed` | Seed 預設 STORE |
| `npm run sync:products` | Sanity 商品同步到 PostgreSQL |
| `npm run studio` | Sanity Studio（V2 專案） |
| `npm run sanity:migrate-from-v1` | 從 V1 正式內容再同步到 V2 Sanity |
| `npm run db:studio` | Drizzle Studio |

## 與 V1 隔離

| | V1 | V2 |
|---|---|---|
| 專案 | `electrical-earth` | `boaquarium-v2` |
| Git | 既有 repo | **獨立 repository** |
| DB | V1 PostgreSQL（若有） | **獨立 PostgreSQL（Neon）** |
| Sanity project | `iz7fvprm` | **`jt3vrzpz`（獨立專案）** |
| Sanity dataset | `production` | `production` |
| 網址（規劃） | boaquarium.vercel.app | boaquarium-v2-test.vercel.app |
