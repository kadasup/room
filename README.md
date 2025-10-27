# 一斗夢包棟民宿｜空房表（前台）部署說明

這是前台唯讀版，顯示最近三個月的空房狀態：
- 可訂日期：點擊會直接撥打 **0905-385388**
- 已滿/過去日期：不可點
- 週末淡紅底、今天淡黃底＋右上紅點
- 可用上/下三個月按鈕、左右鍵、手機左右滑動切換月份

## 快速部署

### 方案 A：直接丟到靜態空間
把 `index.html` 上傳到任一靜態空間即可：
- GitHub Pages / Cloudflare Pages / Netlify / Vercel / S3 / 自家主機（Nginx/Apache）

### 方案 B：自家主機（Nginx）樣板
```
server {
  listen 80;
  server_name your.domain.com;

  root /var/www/yidoumeng-public;
  index index.html;
  location / {
    try_files $uri /index.html;
  }
}
```
將 `index.html` 放到 `/var/www/yidoumeng-public/` 後重新載入 Nginx。

## 和後台資料同步
目前前台讀取 `localStorage` 的資料 key：`vacancy-calendar-<年份>`。
正式上線建議改為從 API 讀取 JSON：
- 後台（admin）寫入遠端 API
- 前台（public）改為 `fetch(GET)` 該 JSON 後渲染
（需要的話我可以再提供 API 版 `index.html` 範例）
