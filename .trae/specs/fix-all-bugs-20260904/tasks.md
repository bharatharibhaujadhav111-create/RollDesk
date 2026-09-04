# Tasks — Fix all upload / indexing / search bugs

- **Phase**: Plan
- **Parent Spec**: [spec.md](./spec.md)
- **Project Root**: `C:\Users\Vijay\Downloads\Electoral-Roll-Search\Electoral-Roll-Search`

## Dependency order (must run sequentially within a tier)

- Tier 1: T1, T2 (storage utilities + worker cleanup — independent, but T2 reads the helpers so do T1 first).
- Tier 2: T3, T4 (download route + upload persistence).
- Tier 3: T5 (init gating).
- Tier 4: T6 (scoring unification — independent of T1–T5, so can actually run anytime).
- Tier 5: T7 (UI progress + admin errors polish).

## Task 1 — Add Supabase storage helpers + mirror on upload (covers AC-2, AC-4)

**Covers**: FR2, AC-2, AC-4.

**Files to edit**:
- `electoral-roll.ts` — add new exported helpers inside the storage block.

### Description
In `src/server/electoral-roll.ts`, add three helpers:
1. `mirrorPdfToStorage(localPath: string, storageKey: string): Promise<void>`
   - Reads file stream from disk → upload to Supabase Storage bucket `PDF_BUCKET`, key = `storageKey`.
   - Uses `fileSizeLimit` option for upload up to 500 MB numeric (NOT a string; see project memory notes).
   - If Supabase client is null or the upload fails because the bucket doesn't exist, do NOT throw: emit a warning into `state.warnings` and return instead. We want uploads to succeed on localhost without bucket, with notice.
2. `ensurePdfLocal(pdfId: string): Promise<string>`
   - Returns the local path `pdfDirectory/<id>.pdf` **after** guaranteeing it exists locally.
   - If missing locally, check `pdf_assets.storage_path` → download bytes from Supabase Storage bucket into that local path via streaming.
   - On failure, throw the precise "missing PDF / reupload" message so worker surfaces it (we'll improve wording elsewhere).
3. `storageKeyForPdf(pdfId: string)` = `pdfs/${pdfId}.pdf` (shared constant).

Then modify `addPdfFromStream` right after the successful `fs.rename(temporaryPath → filePath)` step:
- call `mirrorPdfToStorage(filePath, storageKeyForPdf(safeId))`
- before calling `createDatabaseJob`, update the `storagePath` argument from the local absolute path to a canonical format:
  - prefer `storageKeyForPdf(safeId)` when mirroring is available so the worker later knows "go to Supabase".
  - keep the local path as fallback when mirroring wasn't available (bucket missing).

### TRs (task-local verification)

#### rule T1-TR1
`mirrorPdfToStorage` never throws if `getSupabaseAdmin()` returns null; it returns successfully and records at most 1 warning per invocation.
- Evidence: code inspection + run unit mock in a JS snippet (or manually inject null client, no exception raised).

#### rule T1-TR2
`storageKeyForPdf("roll-abcd")` returns exactly `"pdfs/roll-abcd.pdf"`.
- Evidence: assert in REPL.

#### rubric T1-TR3 — Streaming upload correctness (0–2; pass ≥ 1)
Score 2: `mirrorPdfToStorage` uses `fsSync.createReadStream(localPath)` → `storage.from(...).upload(key, stream, { ... })` so peak memory stays in the KB range for 500 MB files.
Score 1: Falls back to `await fs.readFile` (not ideal but works for <50 MB + catches most cases).
Score 0: `arrayBuffer()` / full Buffer in the mirror path.
- Evidence: code inspection of the `mirrorPdfToStorage` implementation.

Status: **pending**

## Task 2 — Fix indexing worker redundant copies + Supabase refetch (covers AC-5, AC-6)

**Covers**: FR3, FR5, NFR4, AC-5, AC-6.

**Files**:
- `src/server/electoral-roll.ts` — `processQueuedJobs` function (around L1653–L1745).

### Description
In the worker loop body (inside the `try` that starts L1705):
1. Use `await ensurePdfLocal(asset.id)` (from T1) FIRST — this guarantees the local file exists or throws cleanly.
2. Delete the duplicate block currently at L1731–L1734 that re-copies `localPath → pdfDirectory/<asset.id>.pdf` (it's now guaranteed by step 1).
3. Keep a single copy to `temporaryPath` for extraction (pdf.js / pdftotext work best on a stable tmp location), i.e., ONE `copyFile(local → temporaryPath)` total.
4. After extraction starts and we know the page count, set `databasePageCount` once — already done, keep it.
5. Add a short best-effort re-indexing retry for the transient "missing bucket" case: if `ensurePdfLocal` failed because the bucket is inaccessible and the file exists locally, treat that as success (it's a localhost-only mode).

### TRs

#### rule T2-TR1
Within the body of `processQueuedJobs` (for-loop body), there is at most **one** `copyFile` or `writeFile` call that writes a PDF blob per each claimed job — the working copy into `temporaryPath`.
- Evidence: grep of `processQueuedJobs` function body for `copyFile|createWriteStream|writeFile` — count = 1.

#### rule T2-TR2
If we pre-populate `pdf_assets` row with storage_path = `pdfs/<id>.pdf` (from T1) and delete local file, then run `processQueuedJobs(1)`: the job does not fail with "source PDF missing"; after the run local file exists and job status is `ready` (or `ocr` / `extracting` → eventually `ready`).
- Evidence: manual reproduction + DB select showing status transition.

#### rubric T2-TR3 — Failure handling clarity (0–2; pass ≥ 1)
Score 2: Three distinct error messages for three distinct cases: (a) file missing everywhere, (b) Supabase unreachable but file local, (c) bucket/policy misconfigured.
Score 1: Two distinct messages, one clearly covers the most common case.
Score 0: One generic `Indexing failed` string.
- Evidence: reading the new catch paths in `processQueuedJobs`.

Status: **pending**

## Task 3 — `/api/files/:id` download fallback + local caching (AC-5)

**Covers**: FR4, AC-5.

**Files**:
- `src/app/api/[...path]/route.ts` — GET handler for `/api/files/*` segment.

### Description
Inspect the current GET `/api/files/[id]` handler (or the catch-all switch in `[...path]` route if files is routed through there). If the `downloadPdf(id)` call fails because the local file is missing:
1. Call `ensurePdfLocal(id)` (from T1) first — this will stream from Supabase Storage → local cache.
2. Then call `downloadPdf(id)` again and serve it with headers:
   - `Content-Type: application/pdf`
   - `Content-Disposition: inline; filename="<displayNameSafe>"` (fetch the original name from `getAdminStats`/listPdfs helper to get label; fallback to `<id>.pdf`)
   - 1 hour `Cache-Control` to avoid repeat downloads.

### TRs

#### rule T3-TR1
A GET `/api/files/<id>` where `pdfDirectory/<id>.pdf` is initially missing returns HTTP 200 with a PDF body (identical bytes to what was uploaded) on the first call when the Supabase Storage object exists for the key.
After this call, the local `pdfDirectory/<id>.pdf` must exist.
- Evidence: delete local, GET, check `fs.existsSync` + byte compare.

#### rule T3-TR2
If both local + storage are missing, the handler returns 404 JSON `{ error: "...", hint: "Re-upload this PDF." }` — never a 500.
- Evidence: code inspection.

Status: **pending**

## Task 4 — Strengthen POST `/api/admin/pdfs` response guarantees (AC-2, AC-3)

**Covers**: FR1, FR2, NFR3, AC-2, AC-3.

**Files**:
- `src/app/api/[...path]/route.ts` — POST `/api/admin/pdfs` (already rewritten to stream).

### Description
Ensure the upload route:
1. Uses `addPdfFromStream` + the storage mirror (covered in T1 — mirrors AFTER local rename, so disk file is first-source-of-truth).
2. After mirror succeeds, adds an explicit server-side log line containing `(sizeBytes, storagePath, mirrorStatus: "ok" | "skipped" | "failed-with-warning")` for observability on Vercel.
3. If request body stream errors mid-upload (client disconnects), clean up the `.uploading` temp file via `finalizer`/`try/finally` around the stream reading. (Note: `pipeline` already aborts the write stream, so add a finally to rm `temporaryPath` unless it was renamed successfully.)
4. Update the 5-minute route timeout hint (`maxDuration = 300` already) — keep it but add a comment mentioning Vercel plan limits.

### TRs

#### rule T4-TR1
There are zero calls to `request.arrayBuffer()`, `request.text()`, `request.json()` within the `/api/admin/pdfs` handler path — only `request.body.getReader()` + stream.
- Evidence: `rg "arrayBuffer\(\)|text\(\)|json\(\)" src/app/api/\[...path\]/route.ts` returns no matches in that branch scope.

#### rule T4-TR2
Upload response body (the returned `PdfAsset`) includes the original `name` identical to what `listPdfs()` shows, AND the status field starts as `queued` (not `failed`).
- Evidence: read the returned asset shape from `listPdfs()` — matches our return.

Status: **pending**

## Task 5 — Safe initialization gating (AC-8)

**Covers**: FR7, AC-8.

**Files**:
- `src/server/electoral-roll.ts` — `ensureStorage` (L1140–L1189).

### Description
Refactor the `initialized` boolean so that:
1. If `indexIsStale === true` and we enter the `rebuildIndex()` branch, do NOT set `initialized = true` synchronously before it finishes.
2. Instead: create an in-flight `Promise<void> | null` (`initializingPromise`), and while it's non-null, concurrent callers of `ensureStorage()` `await` the same promise.
3. Only after `rebuildIndex()` settles do we resolve the promise and flip `initialized = true`.
4. Guard the in-memory state reads (records, searchDocuments, state.status) behind this latch — it's already global but now consistent.

### TRs

#### rule T5-TR1
Concurrent calls to `ensureStorage()` (Promise.all with 3 parallel calls) all return only after the first-time `rebuildIndex()` call has set the records array to its final size for that boot.
- Evidence: add ad-hoc script (or inline self-verification stub) that asserts `.length` equality across all 3 promises' return values; show a pass.

#### rubric T5-TR2 — Deadlock avoidance (0–2; pass ≥ 1)
Score 2: The promise-based latch uses no setInterval polling, no locking that could deadlock, and if `rebuildIndex()` rejects the callers receive the error + a flag `initialized = false` so a later retry succeeds.
Score 1: Works for the happy path; error handling in catch is basic.
Score 0: Promise hangs on throw / bad state leaks.
- Evidence: code review.

Status: **pending**

## Task 6 — Unify scoring helpers (AC-7, AC-10)

**Covers**: FR6, AC-7, AC-10.

**Files**:
- `src/server/electoral-roll.ts` — `wordScore` and `normalizedWordScore`, plus `searchIndex` / `getSuggestions` call sites.

### Description
Remove the inconsistent duplication:
1. Rename `normalizedWordScore` → `fuzzyMatchScore`.
2. Add JSDoc-style comment (a single one-line comment is fine per code style) that inputs must be pre-cleaned (since callers already clean via `clean()`).
3. DELETE `wordScore` entirely.
4. Update any caller that was using `wordScore` (check `searchIndex` and `getSuggestions`) to pass cleaned inputs to the renamed `fuzzyMatchScore`.
5. In `searchIndex`, ensure `normalizedName`, `document.voterName` (already assigned via `clean`) remain pre-cleaned. Confirm all call sites now pass clean strings.

### TRs

#### rule T6-TR1
After refactor, `rg "\bwordScore\b" src/server/electoral-roll.ts src/app/api` returns no hits. `fuzzyMatchScore` is the single remaining multi-word fuzzy comparator.
- Evidence: run ripgrep, capture result.

#### rubric T6-TR2 — Backwards behavior (0–2; pass ≥ 1)
Score 2: For any pair `(query, target)` that passes through both old and new functions on clean inputs, the new score equals the old `normalizedWordScore` — no drift.
Score 1: New scores are within ±0.02 absolute difference for any pair in a 30-pair smoke set.
Score 0: Different scores with visible ranking shifts for valid results.
- Evidence: side-by-side comparison for a smoke matrix.

Status: **pending**

## Task 7 — Admin UI progress + better error messages (AC-1, AC-9)

**Covers**: FR1, FR8, AC-1, AC-9.

**Files**:
- `src/components/pages/admin.tsx` — uploadFile + progress section.

### Description
1. Keep the progress bar visible for **3 seconds** (not 1.5s) after upload succeeds, OR let the progress stay until the next upload starts (remove the setTimeout entirely, clear `setUploadProgress(null)` on `start of uploadFile` entry instead). Preferred option: clear on start of next upload.
2. Add specific handling for these distinct error classes on the client:
   - HTTP 413 + response body mentions "Supabase" or "storage": message = *"The server rejected the upload while saving to cloud storage. Check bucket policies, then retry."*
   - HTTP 413 generic: *"File exceeded size limits — try compressing the PDF or split to fewer pages."*
   - HTTP 401/403: *"Server rejected credentials — refresh the page and try again."*
   - XHR network error (`xhr.upload.onerror` fired): *"Upload was interrupted mid-transfer. Please retry."*
   - Any error including "not a valid PDF": *"Not a valid PDF (magic header mismatch)."*
3. Add `aria-live="polite"` to the error/notice container for screen readers.

### TRs

#### rule T7-TR1
The progress bar reset to `null` only happens at the beginning of `uploadFile` (entry) OR when `Upload failed` — not via a short `setTimeout` that hides it.
- Evidence: code inspection of `uploadFile`.

#### rubric T7-TR2 — Error message coverage (0–2; pass ≥ 1)
Score 2: Five distinct error-message branches for the cases listed above.
Score 1: Three distinct branches with appropriate wording for 413 generic + 403 + network.
Score 0: Still one generic failure branch.
- Evidence: code inspection of error handling switch.

Status: **pending**

## AC coverage map

| Spec AC | Mapped Task TRs |
| --- | --- |
| AC-1 (build + types) | T4-TR1 (static shape), plus every task's edit must pass `npm run typecheck` |
| AC-2 (upload end-to-end) | T1-TR1, T1-TR2, T4-TR2 |
| AC-3 (streaming, no arrayBuffer) | T4-TR1, T1-TR3 |
| AC-4 (storage mirror on upload) | T1-TR1, T1-TR3 |
| AC-5 (cold start durability + download route) | T2-TR2, T3-TR1, T3-TR2 |
| AC-6 (worker single copy) | T2-TR1 |
| AC-7 (single scoring primitive) | T6-TR1, T6-TR2 |
| AC-8 (safe initialization latch) | T5-TR1, T5-TR2 |
| AC-9 (error actionability rubric) | T7-TR2 |
| AC-10 (search regression safety) | T6-TR2 |

## Stop conditions

- Stop the implementation phase for a task when **all of its rule TRs pass** and every rubric TR has a score ≥ the pass threshold + rationale recorded in `Completion Evidence`.
- Stop the overall queue when every task has status `completed` or a user-approved `cancelled` reason, and the spec AC coverage map has each AC covered by at least one passing TR with evidence recorded.
