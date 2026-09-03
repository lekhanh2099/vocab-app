# Google Sheet vocabulary data source

Branch: `feature/google-sheet-data-source`

## Source of truth

The app reads vocabulary only from the `Tất cả từ` tab of the private Google Sheet `Quản lý từ vựng – 4 giáo trình`.

- Spreadsheet ID: `1I1VLM2fpZAkKCrAbo_YIa8R5lZ64RRxZSykEBjEoovw`
- Sheet: `Tất cả từ`
- Columns: `A:O` (15 columns)
- Required app columns: `Nguồn`, `Bài/Unit`, `Tên bài`, `Từ`, `Pinyin`, `Nghĩa`
- Optional app columns: `Từ loại`, `Hán Việt`
- `Trạng thái`, `Mức nhớ`, `Ghi chú` never overwrite Dexie/FSRS progress.

## Runtime flow

```text
Browser
  -> GET /api/vocabulary
  -> Vercel Function (or Vite dev middleware)
  -> POST Apps Script /exec + server-only secret
  -> Apps Script executes as the Sheet owner
  -> private Google Sheet / Tất cả từ
  -> JSON values
  -> server converts values to CSV
  -> existing parser + integrity checks
  -> canonical dataset
  -> Dexie / IndexedDB
```

The Sheet itself remains private. It does not need `Anyone with the link` and does not need `Publish to web`.

There is no bundled vocabulary JSON fallback. A new browser/device must complete one successful sync before the app has vocabulary data. Later launches use the last valid IndexedDB dataset immediately and refresh in the background. A failed refresh never clears cached data.

## 1. Apps Script setup

Open `Quản lý từ vựng – 4 giáo trình` -> **Extensions -> Apps Script**.

Replace `Code.gs` with the repository file:

```text
apps-script/Code.gs
```

The script is deliberately narrow:

- hard-coded to this spreadsheet ID
- reads only `Tất cả từ`
- reads only the first 15 columns (`A:O`)
- `GET /exec` returns no vocabulary
- only `POST` with the correct secret returns values

### Script secret

In Apps Script open **Project Settings -> Script Properties** and add:

```text
VOCAB_API_SECRET=<long random secret>
```

Use at least 24 characters; 32+ random characters is recommended. Do not put the real secret in `Code.gs` or GitHub.

## 2. Deploy Apps Script

**Deploy -> New deployment -> Web app**

- Execute as: **Me**
- Who has access: **Anyone**

Deploy and copy the URL ending in `/exec`:

```text
https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
```

The Web App URL is public, but it does not expose vocabulary without the POST secret. The Google Sheet remains private because Apps Script reads it under the deploying owner's authority.

When `Code.gs` changes later, update/create the Apps Script deployment before expecting the live endpoint to use the new code.

## 3. Local development

Copy `.env.example` to `.env.local`:

```text
APPS_SCRIPT_VOCAB_URL=https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec
APPS_SCRIPT_VOCAB_SECRET=<same value as VOCAB_API_SECRET>
```

`vite.config.ts` owns `/api/vocabulary` locally. It sends the secret to Apps Script in an HTTPS POST body; the browser never receives either the Apps Script secret or the direct Apps Script URL.

Expected local behavior:

- config missing/invalid -> `/api/vocabulary` returns `503`
- Apps Script unreachable, undeployed, wrong secret, or script error -> `502`
- valid Apps Script data -> `200 text/csv`

## 4. Vercel environment

When this feature is eventually merged to the deployment branch, set the same two server-side environment variables:

```text
APPS_SCRIPT_VOCAB_URL
APPS_SCRIPT_VOCAB_SECRET
```

Never prefix either variable with `VITE_`.

`feature/google-sheet-data-source` is intentionally excluded from automatic Vercel deployment. `vercel.json` enables Git deployment only for `main`.

## Current baseline verification

Checked directly against `Tất cả từ` on 2026-09-03:

- TM2: 171
- TM3: 233
- Nhịp cầu: 831
- Đọc hiểu: 1,240
- Total: **2,475 occurrences**
- Canonical Hanzi lexemes: **2,300**

The client rejects missing headers, malformed source/lesson values, missing Hanzi/Pinyin/meaning, or a severely truncated textbook group.

## Security boundary

This setup protects the Google Sheet and keeps its credentials/ownership private. The browser cannot read the Sheet directly and never sees `APPS_SCRIPT_VOCAB_SECRET`.

The Vercel `/api/vocabulary` route is still an application endpoint rather than per-user authentication. Its same-origin check reduces normal cross-origin browser access but does not make vocabulary confidential against a determined direct HTTP client. Add real user/session authorization if the vocabulary itself ever needs per-user confidentiality.
