# 一斗夢房型檔期

這是一個靜態前端加上 Google Apps Script 後端的房況查詢小專案，提供：

- 公開頁查詢未來三個月房況
- 後台切換日期狀態與批次更新
- 與 Google 試算表同步資料
- 顯示台灣假日、今日位置與週末底色

## 專案結構

- [index.html](/C:/Users/Cyrus-MSI/.gemini/antigravity/scratch/room/index.html:1)：前台頁面
- [admin.html](/C:/Users/Cyrus-MSI/.gemini/antigravity/scratch/room/admin.html:1)：後台頁面
- [styles.css](/C:/Users/Cyrus-MSI/.gemini/antigravity/scratch/room/styles.css:1)：共用樣式
- [calendar-core.js](/C:/Users/Cyrus-MSI/.gemini/antigravity/scratch/room/calendar-core.js:1)：共用月曆核心
- [public.js](/C:/Users/Cyrus-MSI/.gemini/antigravity/scratch/room/public.js:1)：前台邏輯
- [admin.js](/C:/Users/Cyrus-MSI/.gemini/antigravity/scratch/room/admin.js:1)：後台邏輯
- [gas/程式碼.js](/C:/Users/Cyrus-MSI/.gemini/antigravity/scratch/room/gas/%E7%A8%8B%E5%BC%8F%E7%A2%BC.js:1)：Google Apps Script 後端

## 前台功能

- 顯示起始月份起算的三個月月曆
- 綠色表示可安排，紅色表示客滿
- 灰色表示已過日期
- 顯示台灣節假日與今日標記
- 支援手機與桌面版 RWD
- 支援後台更新後自動刷新

## 後台功能

- 點擊未來日期即可切換 `free` / `full`
- 本月星期六一鍵設為客滿
- 本月未來日期一鍵恢復可安排
- 更新成功後通知同瀏覽器前台立即刷新

## GAS 資料格式

Google 試算表工作表 `status`：

- A 欄：`YYYY-MM-DD`
- B 欄：`free` 或 `full`

## 部署方式

### 靜態頁面

可直接部署到 GitHub Pages、Netlify、Cloudflare Pages 或任何靜態空間。

### GAS

若要同步 Apps Script 專案：

```powershell
clasp login
clasp push
```

如果已部署成 Web App，GAS 程式有變更後記得更新 deployment，讓線上網址吃到最新版本。

## 已知限制

- `ADMIN_TOKEN` 目前仍在前端，安全性有限
- 前台跨裝置同步主要依賴定時刷新
- 台灣假日資料使用外部 JSON 來源，若來源失效，房況功能仍可使用，但假日名稱會缺少
