# Electoral Roll Search

Fast public search over locally managed electoral-roll PDFs, with an administrator workspace for PDF uploads and index health.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/electoral-roll-search run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- PDFs are stored in `./pdfs`; the persistent searchable metadata index is `./pdf-index.json` and its health state is `./pdf-index-state.json`
- No database or authentication is used by design. The admin route is intentionally unauthenticated per product requirements.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- Validation: generated Zod schemas
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite + TanStack Query + Wouter

## Where things live

- `artifacts/electoral-roll-search/src/pages/search.tsx` — public search experience
- `artifacts/electoral-roll-search/src/pages/admin.tsx` — PDF management and index health
- `artifacts/api-server/src/lib/electoral-roll.ts` — filesystem storage, query parser, fuzzy ranking, and index lifecycle
- `artifacts/api-server/src/routes/electoral-roll.ts` — search, PDF, and admin endpoints
- `lib/api-spec/openapi.yaml` — API source of truth

## Architecture decisions

- PDFs remain the source of truth; `pdf-index.json` stores only derived searchable record metadata for fast in-memory lookups.
- Natural-language queries are parsed into name, relative-name, and EPIC filters before ranking; PDF bytes are never passed to the parser.
- Index rebuilds run in the background after upload, rename, delete, and manual rebuild requests.
- Search continues against the last completed and page-by-page partial index while a rebuild is running; the response reports live index status and progress.
- Uploaded PDFs and derived index files are filesystem-persisted in the project workspace, so browser refreshes and API restarts do not remove them.
- A fresh installation starts empty; the public search only returns records extracted from administrator-uploaded PDFs.

## Product

The public route supports full, partial, misspelled, fuzzy, phonetic, EPIC, and simple natural-language voter searches. Results include the voter and relative name, part/page, source PDF, and links to open the PDF, jump to the matching page, or download it. The admin route supports multiple uploads, filename filtering, rename/delete, index rebuild, progress, and health metrics.

## User preferences

No additional preferences recorded.

## Gotchas

- The admin route has no authentication because the requested product explicitly requires no login. Add access control before exposing it publicly.
- PDF text extraction uses `pdftotext` when available and falls back to `pdftoppm` + Tesseract OCR for image-only pages. Text-based electoral PDFs can be indexed using pipe-delimited or comma-delimited rows.
- Vite build requires workflow-provided `PORT` and `BASE_PATH`; use the managed web workflow instead of invoking a bare build without those variables.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
