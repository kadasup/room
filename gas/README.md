# Google Apps Script Backend

This folder stores the Google Apps Script backend used by the room calendar.

Files:
- `Code.gs`: Web App endpoint implementation used by the frontend
- `appsscript.json`: Apps Script manifest for Web App deployment

Current contract:
- `GET ?year=YYYY` returns `{ ok, year, status, updatedAt }`
- `POST` accepts `token`, `year`, and `delta`
- Spreadsheet columns are `A=date` and `B=status`

Notes:
- `TOKEN` must match the frontend admin token in `admin.js`
- The deployed Web App URL is configured in `index.html`, `public.js`, and `admin.js`
- A `clasp` config template is provided at the repo root: `.clasp.json.example`

Using clasp:
1. Install `@google/clasp` globally, for example: `npm install -g @google/clasp`
2. Log in with `clasp login`
3. Create `.clasp.json` from `.clasp.json.example`
4. Replace `scriptId` with the Apps Script project ID
5. Push code with `clasp push`
6. Open the Apps Script project with `clasp open`

Important:
- This environment does not currently have `clasp` installed, so the config was prepared but not executed here
- The real `.clasp.json` was not created because it needs your actual Apps Script `scriptId`
