# Sanity 雲端後台設定（水博館水族）

本專案已整合 **Sanity** 內容後台（Schema + CLI／雲端 Studio）；預設以 **純靜態** 建置網站，後台透過 `sanity dev` 或 `sanity deploy` 開啟（見下文）。

## 1. 建立 Sanity 雲端專案

1. 前往 [sanity.io](https://www.sanity.io/) 註冊／登入。
2. 開啟 [Sanity Manage](https://www.sanity.io/manage) → **Create project**。
3. 記下 **Project ID**（約 8 個字元）。
4. 建立或使用預設 **Dataset**（建議名稱：`production`）。

## 2. 設定本機環境變數

```bash
cp .env.example .env
```

編輯 `.env`：

```env
PUBLIC_SANITY_PROJECT_ID=你的ProjectID
PUBLIC_SANITY_DATASET=production
```

> `PUBLIC_` 前綴讓 Astro 可在建置時讀取（僅 Project ID 與 Dataset 名稱，**不要**把具寫入權限的 token 放進 `PUBLIC_` 變數）。

## 3. 啟動開發伺服器

```bash
npm run dev
```

- 網站：`http://localhost:4321/`

> **重要**：請先完成步驟 2 建立 `.env` 並填入 `PUBLIC_SANITY_PROJECT_ID`，否則 `@sanity/astro` 不會載入（`sanity:client` 也無法使用），但網站仍可正常建置與瀏覽。

## 4. 開啟雲端／本機後台（Sanity Studio）

本專案預設 **不內嵌** `/admin`（內嵌需 SSR + adapter，不利純靜態部署）。後台請用下列方式擇一：

### 方式 A：本機 Studio（開發最常用）

```bash
npx sanity dev
```

依提示在瀏覽器開啟（常見為 `http://localhost:3333`），即可編輯 Schema 與文件。

### 方式 B：部署到 Sanity 雲端網址

```bash
npx sanity deploy
```

完成後會得到 `https://你的專案名.sanity.studio` 這類網址，即為 **雲端後台**。

第一次使用時，若出現 **CORS** 相關提示，請在 [Sanity Manage](https://www.sanity.io/manage) → 你的專案 → **API** → **CORS origins** 加入你實際使用的網址（本機 Studio 網址、日後正式網域等）。

### 方式 C（進階）：內嵌在自家網站的 `/admin`

若希望後台與 Astro 同網域，需在 `astro.config.mjs` 的 `sanity({...})` 加上 `studioBasePath: '/admin'`、安裝並啟用 `@astrojs/react` 的 `react()`，並將專案改為 **`output: 'hybrid'`（或 `server`）+ 部署用 adapter**（例如 `@astrojs/node`、`@astrojs/vercel`）。詳見 [Sanity Astro 說明](https://github.com/sanity-io/sanity-astro)。

---

## 5. Schema 說明

目前已定義 **`product`**（商品／展示項目）文件類型，欄位包含：

- 名稱、slug、分類（魚類／器材／水劑）
- 圖片、短述、內文
- 首頁精選、占位範例

之後可在 `sanity/schemaTypes/` 新增更多文件類型。

### 促銷圖 `promoImages`：電腦一次加多張

在 Studio 裡若用「點上傳」開檔案視窗，**很多瀏覽器一次只能選一張**，這是常見限制。若要一次加很多張：

1. 在檔案總管（Windows）或 Finder（Mac）**選取多個圖檔**（Ctrl／Shift 多選）
2. **整批拖曳**到「促銷圖片」陣列區塊上放開

若仍只能單張，可改為重複「新增項目」逐張加入，或安裝 `sanity-plugin-media` 用媒體庫挑圖。

## 6. 網站與內容連動（已接上）

首頁精選、全部分頁列表、分類頁、各 `/product/[slug]` 已改為 **建置時** 從 Sanity 讀取 `_type == "product"` 文件（見 `src/lib/sanity/fetchProducts.ts`）。
促銷頁 `/promo/[slug]` 目前為 **SSR 即時讀取**，可即時反映 Studio 內 `promoImages` 的拖曳排序（見 `src/lib/sanity/fetchPromotions.ts`）。

- 請在 Studio 建立商品並填 **slug**（英文網址）、分類、圖片等；首頁區塊會優先顯示勾選 **首頁精選** 的項目。
- **商品等靜態頁**：內容更新後需 **重新執行 `npm run build` 並部署**，訪客才會看到新資料。
- **促銷頁 `/promo/[slug]`**：不需重建即可讀到最新排序與內容（前提：Studio 變更已儲存／發佈）。
- 亦可改用 `sanity:client` 在單頁撰寫 GROQ；目前實作使用 `@sanity/client` 以利型別與快取。

## 7. 相關檔案

| 檔案 | 說明 |
|------|------|
| `sanity.config.ts` | Studio 與 schema 總設定 |
| `sanity.cli.ts` | Sanity CLI（如 `npx sanity`）用的 API 設定 |
| `sanity/schemaTypes/` | 內容模型 |
| `astro.config.mjs` | 有設定 `PUBLIC_SANITY_PROJECT_ID` 時載入 `@sanity/astro` |
