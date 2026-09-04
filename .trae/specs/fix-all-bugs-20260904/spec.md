# Spec — Fix all upload / indexing / search bugs

- **Phase**: Specify
- **Natural language**: English
- **Created**: 2026-09-04
- **Codebase**: `artifacts/electoral-roll-search` (Next.js 15.5.25, Node runtime, Supabase + local PDF storage)

## Problem

Users and administrators see failures across the entire pipeline:
1. PDF uploads frequently fail with `HTTP 413 (Payload Too Large)` on large files (>10 MB) because the server route used `request.arrayBuffer()` which applies Next.js's strict default body size limit + loads everything into memory.
2. On Vercel serverless, **even "successful" uploads fail to index later** because PDFs are only written to the local filesystem (`tmpdir()` on Vercel = `/tmp`), which is ephemeral across cold starts. The worker then throws: *"The source PDF is missing from the local data/pdfs folder. Re-upload the PDF to index it."*
3. `/api/files/:id` PDF download route works on a warm server but returns 404 on a cold Vercel instance because the file is gone from `/tmp`.
4. `processQueuedJobs` copies a PDF twice (`localPath → tmpPath → localPath`), a redundant / potentially race-condition-prone copy.
5. Inconsistent / duplicate scoring helpers (`wordScore` vs `normalizedWordScore`) — one cleans input, the other assumes caller already cleaned, making them easy to misuse.
6. `ensureStorage` sets `initialized = true` *before* `rebuildIndex()` finishes, so concurrent requests during boot can observe an empty / inconsistent in-memory index.
7. Indexing worker uses a `new Date(Date.now() - 15 minutes)` stale-recovery threshold but time-based comparisons can recover a job that is actively being worked on by another Vercel function (no heartbeats or `claimed_by`).
8. Missing durability guarantees on upload — upload "succeeds" only when written to local disk, not when persisted to durable storage (Supabase Storage bucket).
9. `admin.tsx` upload progress bar only persists for 1500 ms after completion, making it hard to confirm large uploads finished when the user looks away.

## Users

- **Admin user** (internal operator): Uploads PDFs, monitors indexing status, re-indexes existing PDFs, views voter records via search.
- **Search user**: Searches voters by name / relative / EPIC and relies on fresh, consistent results.
- **Deploy operator**: Pushes to Vercel, needs builds to pass and behavior identical on localhost + Vercel.

## Goals

1. Make PDF uploads for valid files (< 500 MB) succeed reliably on localhost + Vercel.
2. Guarantee PDF durability across Vercel cold starts by mirroring bytes to Supabase Storage.
3. Remove the "source PDF missing" class of indexing failures on Vercel; the worker should be able to pull the PDF from Supabase Storage when the local copy is gone.
4. Make `/api/files/:id` serve the PDF even on a cold instance (fallback download from Supabase Storage → cache locally).
5. Remove redundant / buggy file copies in the indexing worker.
6. Eliminate duplicate / inconsistent scoring helpers; centralize matching.
7. Prevent the "inconsistent index during boot" race by only releasing the `initialized` gate after a rebuild completes.
8. Raise evidence (clear admin notice + logs) for every failing upload / indexing step with actionable messages.
9. Keep the existing search accuracy / suggestion ranking behavior intact or improved.

## Non-goals

- Do not rework the database schema or migration this round (we add no migrations).
- Do not replace the custom parser with a new PDF layout engine or OCR provider in this cycle.
- Do not change the `api-zod` / `api-client-react` generated contracts or the `VILLAGES` static list.
- Do not add realtime or WebSocket features; progress stays HTTP polling / client-side only.
- Do not change authentication or add user/role management.

## Functional requirements

FR1 — **Upload contract**: The admin-page upload flow accepts a PDF file `< 500 MB` that starts with `%PDF-`, streams it to the server without chunking, shows a progress bar, and surfaces a specific error for `HTTP 413`, non-PDFs, empty files, and oversized files.

FR2 — **Durable save**: After streaming bytes to the local disk `.uploading → rename`, the server also copies the finished PDF to the Supabase `electoral-roll-pdfs` storage bucket (key: `pdfs/<id>.pdf`), and updates the `storage_path` column to reflect the durable location. The upload HTTP response only returns 201 after the Supabase copy succeeds.

FR3 — **Worker refetch**: `processQueuedJobs`, when unable to find the PDF locally, downloads the bytes from Supabase Storage `electoral-roll-pdfs/pdfs/<id>.pdf` into `pdfDirectory/<id>.pdf` before copying to tmpdir for extraction, and retries the job in the same run.

FR4 — **Download route**: GET `/api/files/:id` first checks the local `pdfDirectory`; if missing, streams the PDF from Supabase Storage, writes a cached copy to `pdfDirectory/<id>.pdf` for subsequent requests, and then serves the cached file (or stream + cache in parallel).

FR5 — **Worker file-copy cleanup**: The indexing worker uses the already-local `<pdfDirectory>/<id>.pdf` directly for extraction and copies it ONCE to a tmp path; no duplicate copies back to the same location.

FR6 — **Scoring helper unification**: One canonical function (or two clearly-documented wrappers) handles name/relative/EPIC scoring. Either remove `wordScore` in favor of always using `normalizedWordScore` with pre-cleaned inputs, or merge them; update all callers.

FR7 — **Safe initialization**: `ensureStorage` must not set `initialized = true` (or equivalent public gating) until any required `rebuildIndex()` settle, so concurrent searches see a populated index or a clear "indexing" status, never partial emptiness.

FR8 — **Progress visibility**: Admin progress bar remains visible for at least 3 seconds after a completed upload, or until the user clicks "Done" / starts a new upload.

## Non-functional requirements

NFR1 — **Builds pass**: `pnpm build` in `artifacts/electoral-roll-search` must exit 0 on Vercel (Next 15.5.25, strict TS).

NFR2 — **Type correctness**: `tsc --noEmit` must exit 0 (via the workspace `typecheck` script).

NFR3 — **Memory stability**: Streaming upload of a 200 MB PDF must keep RSS < 1 GB on the server function (no full-body arrayBuffer() in the hot path).

NFR4 — **Consistency on Vercel**: Upload + immediate indexing within the same warm function, or upload in function A + worker in function B (cold), must both produce a "ready" `pdf_assets` row for a valid PDF.

NFR5 — **Search performance cold-start**: After the first `ensureStorage()` completes, subsequent `/api/.../search` and `/api/.../suggestions` requests for a 10k-record dataset stay under 500 ms p95 (the existing DB 10 s cache remains).

NFR6 — **Backward compatibility**: Re-uploads, renames, and list queries from the existing admin UI continue to work without migration of existing rows.

## Constraints

- Targets Node 20+ runtime on localhost and Vercel (`export const runtime = "nodejs"` stays).
- Uses the existing Supabase admin client (`getSupabaseAdmin()`) for DB + storage — no new SDKs.
- `VILLAGES` is a static constant; village id validation must continue to use it.
- `INDEX_FORMAT_VERSION` can be bumped if needed but must cause a one-time re-index of existing files.
- We cannot add new tables / columns to Supabase via migrations in this spec (FR relies on existing columns only).

## Dependencies / assumptions

- `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_URL` env vars are set (or the Supabase integration is configured; `getSupabaseAdmin()` returning non-null is required for FR2–FR4).
- The project already created the `electoral-roll-pdfs` Supabase Storage bucket (per prior code references); the fix should NOT assume the bucket exists and gracefully fall back to "local only" mode with a warning on upload success instead of hard-failing if the bucket is missing.
- `pnpm build` / `npm run typecheck` are the build gate scripts (matches workspace).
- pdfjs-dist legacy build is used (matches existing import).

## Open questions

OQ1. Should the Supabase Storage bucket be `public` (simpler downloads) or `private` with signed URLs per-download? Default answer: **private bucket, service-role signed URLs only on the server side** — safer for electoral PII.
OQ2. Should we backfill existing `pdf_assets` rows whose PDFs exist locally but are missing from the bucket? Default answer: **yes, opportunistically on the next `rebuildIndex` or `getAdminStats` call with best-effort**.
OQ3. 500 MB max on Vercel is enforced via client + runtime stream, but Vercel's hard request-time body limit for a serverless function (10 s / 250 MB depending on plan) can still block truly huge uploads. Should we add a note in the UI, or keep 500 MB and trust the user's plan? Default answer: **keep 500 MB cap, but warn in the upload error if the response 413 message specifically mentions plan limits**.

## Acceptance criteria

### rule AC-1
On `pnpm build` inside `artifacts/electoral-roll-search`, TypeScript validity check (`next build`'s lint-types phase) must exit 0.
- Evidence: CI / local build output = `✓ Compiled successfully` + no `Type error:` lines.

### rule AC-2
A 5 MB valid PDF upload on localhost via the Admin UI completes, shows a progress bar that reaches 100%, produces:
1. a new row in `pdf_assets` with `status = "queued"` (not failed),
2. a corresponding `index_jobs` queued row,
3. a file `<id>.pdf` inside `pdfDirectory/` with the same bytes as the source (hash-identical),
4. the admin list shows the new PDF within < 1 s after the upload refetch.
- Evidence: screenshot + admin list UI (or local log of `listPdfs()` return + `fs.stat`).

### rule AC-3
A 50 MB valid PDF upload does NOT use `request.arrayBuffer()` in its call stack; server RSS stays below 500 MB peak during the transfer.
- Evidence: code inspection of `POST /api/admin/pdfs` handler in `route.ts`; no `arrayBuffer()` / `.text()` / `.json()` call in that handler path.

### rule AC-4
If Supabase Storage `electoral-roll-pdfs` is configured, for a successful upload the object `pdfs/<id>.pdf` is present and downloading its bytes produces a file identical to the source PDF.
- Evidence: Supabase storage.list / storage.createSignedUrl + checksum comparison after upload.

### rule AC-5
Simulated Vercel cold start: delete local `pdfDirectory/<id>.pdf` then call `processQueuedJobs(1)`; the job succeeds (pdf_assets.status → "ready", voters rows inserted, `/api/files/<id>` returns 200 + correct bytes without 404).
- Evidence: run the reproduction steps against the modified code + DB state diff showing status transition.

### rule AC-6
`processQueuedJobs(1)` never copies the same file back into the same destination path; code inspection shows exactly ONE `copyFile`/write per job (to the working tmpdir for extraction).
- Evidence: grep of `copyFile` / `createWriteStream` in the worker shows single-destination behavior.

### rule AC-7
One canonical scoring helper is used consistently for (a) voter name matching, (b) relative name matching, (c) suggestion ranking — no dead duplicate functions.
- Evidence: `searchIndex`, `getSuggestions`, and any related callers reference exactly one shared scoring primitive (or two clearly-named wrappers), with the older duplicate function either removed or reduced to a thin `@deprecated` wrapper that just delegates.

### rule AC-8
`ensureStorage()` does not return successfully to concurrent callers before any required `rebuildIndex()` completes for the first time.
- Evidence: code inspection of the flag gating + a simple test: call `ensureStorage()` twice concurrently and assert records are populated after the second (faster) call returns.

### rubric AC-9 — Admin error actionability (scale 0–2, pass ≥ 1)
Score 2: Every upload / indexing failure path in admin.tsx surface an error message that mentions the filename, the actual HTTP status / exception reason, and a concrete next step (retry, reduce size, check Supabase settings).
Score 1: Most error paths include the filename + real cause; at least HTTP 413 / "missing Supabase bucket" / "invalid PDF" have specific messages.
Score 0: Generic "Upload failed" without distinction.
- Evidence: code walk of `admin.tsx` error handlers + server route error responses.

### rubric AC-10 — Search/suggestion regression safety (scale 0–2, pass ≥ 1)
Score 2: No behavioral regression in a 20-query sample of typical searches (name-only, name+relative, EPIC-only, multi-word, fuzzy). `searchIndex` return shape, `status` transitions, and pagination semantics are byte-identical to pre-change for identical inputs.
Score 1: Search results differ, but only to improve the duplicate scoring inconsistency; suggestion ranking stays the same or improves.
Score 0: Search results degrade, wrong pagination, wrong filters, new 5xx on valid inputs.
- Evidence: 20-query local smoke test set results recorded side-by-side against baseline.
