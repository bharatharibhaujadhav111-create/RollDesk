import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import {
  DeletePdfParams,
  GetSearchSuggestionsQueryParams,
  ListPdfAssetsQueryParams,
  RenamePdfBody,
  RenamePdfParams,
  SearchElectoralRollQueryParams,
  UploadPdfQueryParams,
} from "@workspace/api-zod/generated/api";
import {
  addPdfFromStream,
  appendPdfUploadChunk,
  downloadPdf,
  ensureStorage,
  finalizePdfUpload,
  getIndexState,
  getAdminStats,
  getSuggestions,
  listPdfs,
  pdfDirectory,
  processQueuedJobs,
  preparePdfUpload,
  queueAllIndexJobs,
  rebuildIndex,
  removePdf,
  renamePdf,
  searchIndex,
  VILLAGES,
} from "@/server/electoral-roll";
import { isSupabaseEnabled } from "@/server/local-backend";

export const runtime = "nodejs";

export const maxDuration = 300;

export const dynamic = "force-dynamic";

export const fetchCache = "force-no-store";

type RouteContext = { params: Promise<{ path: string[] }> };

function scheduleIndexing(mode: "queue" | "rebuild", pdfId?: string) {
  after(async () => {
    try {
      if (isSupabaseEnabled()) {
        await processQueuedJobs(1);
        return;
      }
      if (mode === "rebuild") {
        await ensureStorage();
        await rebuildIndex(pdfId ? [pdfId] : undefined);
      }
    } catch (error) {
      console.error("Background electoral roll indexing failed", error);
    }
  });
}

function errorResponse(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "name" in error &&
    error.name === "ZodError"
  ) {
    return NextResponse.json(
      { error: "The request could not be validated" },
      { status: 400 },
    );
  }
  const rawMessage =
    error instanceof Error ? error.message : "Unknown server error";
  if (/pdf too large/i.test(rawMessage)) {
    return NextResponse.json({ error: rawMessage }, { status: 413 });
  }
  if (/not a valid pdf/i.test(rawMessage)) {
    return NextResponse.json({ error: rawMessage }, { status: 400 });
  }
  if (/invalid upload|size mismatch|out of order/i.test(rawMessage)) {
    return NextResponse.json({ error: rawMessage }, { status: 400 });
  }
  if (/cloud upload|supabase|storage/i.test(rawMessage)) {
    return NextResponse.json({ error: rawMessage }, { status: 503 });
  }
  console.error("[API] Unhandled error", rawMessage);
  return NextResponse.json({ error: rawMessage }, { status: 500 });
}

function authorizeStreamingUpload(request: Request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? NextResponse.json(
          { error: "Admin authentication is not configured" },
          { status: 503 },
        )
      : null;
  }
  const authorization = request.headers.get("authorization");
  const unauthorizedResponse = () =>
    NextResponse.json(
      { error: "Admin authentication required" },
      {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Roll Desk Admin"' },
      },
    );
  if (!authorization?.startsWith("Basic ")) return unauthorizedResponse();
  try {
    const credentials = atob(authorization.slice(6));
    const separator = credentials.indexOf(":");
    const username = separator >= 0 ? credentials.slice(0, separator) : "";
    const suppliedPassword =
      separator >= 0 ? credentials.slice(separator + 1) : "";
    if (
      username !== (process.env.ADMIN_USER || "admin") ||
      suppliedPassword !== password
    ) {
      return unauthorizedResponse();
    }
  } catch {
    return unauthorizedResponse();
  }
  return null;
}

async function routePath(context: RouteContext) {
  return (await context.params).path ?? [];
}

export async function GET(request: Request, context: RouteContext) {
  const segments = await routePath(context);
  const query = Object.fromEntries(new URL(request.url).searchParams);

  try {
    if (segments.length === 1 && segments[0] === "healthz") {
      return NextResponse.json({ status: "ok" });
    }
    if (segments.length === 1 && segments[0] === "villages") {
      return NextResponse.json(VILLAGES);
    }
    if (segments.length === 1 && segments[0] === "search") {
      const params = SearchElectoralRollQueryParams.parse(query);
      return NextResponse.json(
        await searchIndex(
          params.q,
          params.page,
          params.pageSize,
          params.village,
        ),
      );
    }
    if (segments.length === 1 && segments[0] === "suggestions") {
      const params = GetSearchSuggestionsQueryParams.parse(query);
      return NextResponse.json(await getSuggestions(params.q));
    }
    if (
      segments.length === 2 &&
      segments[0] === "admin" &&
      segments[1] === "pdfs"
    ) {
      const params = ListPdfAssetsQueryParams.parse(query);
      return NextResponse.json(await listPdfs(params.q));
    }
    if (
      segments.length === 2 &&
      segments[0] === "admin" &&
      segments[1] === "stats"
    ) {
      await ensureStorage();
      const pdfs = await listPdfs();
      const state = await getAdminStats();
      scheduleIndexing("queue");
      return NextResponse.json({
        ...state,
        totalPdfs: pdfs.length,
        totalRecords: state.totalRecords,
      });
    }
    if (segments.length === 2 && segments[0] === "files") {
      await ensureStorage();
      const id = path.basename(segments[1]);
      const filePath = path.join(pdfDirectory, `${id}.pdf`);
      if (fs.existsSync(filePath)) {
        return new NextResponse(await fs.promises.readFile(filePath), {
          headers: { "Content-Type": "application/pdf" },
        });
      }
      try {
        return new NextResponse(await downloadPdf(id), {
          headers: { "Content-Type": "application/pdf" },
        });
      } catch {
        return NextResponse.json({ error: "PDF not found" }, { status: 404 });
      }
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const segments = await routePath(context);
  const query = Object.fromEntries(new URL(request.url).searchParams);

  try {
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "pdfs" &&
      segments[2] === "upload-url"
    ) {
      const params = UploadPdfQueryParams.parse(query);
      if (!VILLAGES.some((item) => item.id === params.village)) {
        return NextResponse.json(
          { error: "A valid village is required" },
          { status: 400 },
        );
      }
      const id = `roll-${randomUUID()}`;
      let upload;
      try {
        upload = await preparePdfUpload(id);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[PDF Upload] Preparation failed", {
          id,
          bucket: "electoral-roll-pdfs",
          message,
        });
        return NextResponse.json(
          {
            error: `Supabase upload preparation failed: ${message}`,
            hint: "Verify SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and the electoral-roll-pdfs bucket, then retry.",
            uploadHandlerVersion: "tus-v2",
          },
          { status: 503 },
        );
      }
      if (!upload) {
        return NextResponse.json(
          { error: "Direct cloud upload is unavailable" },
          { status: 501 },
        );
      }
      return NextResponse.json({
        id,
        name: params.filename,
        villageId: params.village,
        uploadHandlerVersion: "tus-v2",
        ...upload,
      });
    }
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "pdfs" &&
      segments[2] === "chunk"
    ) {
      const authError = authorizeStreamingUpload(request);
      if (authError) return authError;
      const params = UploadPdfQueryParams.parse(query);
      const uploadId = request.headers.get("x-upload-id") || "";
      const chunkIndex = Number(request.headers.get("x-chunk-index"));
      const chunkCount = Number(request.headers.get("x-chunk-count"));
      const totalSize = Number(request.headers.get("x-upload-total-size"));
      console.log("[PDF Upload] Local chunk received", {
        uploadId,
        chunkIndex,
        chunkCount,
        totalSize,
        hasBody: Boolean(request.body),
        contentLength: request.headers.get("content-length"),
      });
      if (
        !request.body ||
        !uploadId ||
        !Number.isInteger(chunkIndex) ||
        !Number.isInteger(chunkCount) ||
        !Number.isSafeInteger(totalSize) ||
        chunkCount < 1 ||
        chunkIndex < 0 ||
        chunkIndex >= chunkCount
      ) {
        return NextResponse.json(
          { error: "Invalid upload chunk" },
          { status: 400 },
        );
      }
      if (!VILLAGES.some((item) => item.id === params.village)) {
        return NextResponse.json(
          { error: "A valid village is required" },
          { status: 400 },
        );
      }
      const reader = request.body.getReader();
      const stream = (async function* bodyToBytes() {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) yield value;
        }
      })();
      const result = await appendPdfUploadChunk({
        id: uploadId,
        name: path.basename(params.filename),
        villageId: params.village,
        chunkIndex,
        chunkCount,
        totalSize,
        stream,
      });
      if (result.complete) {
        scheduleIndexing("rebuild", result.asset?.id ?? uploadId);
      }
      return NextResponse.json(result, { status: result.complete ? 201 : 202 });
    }
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "pdfs" &&
      segments[2] === "finalize"
    ) {
      const body = (await request.json()) as {
        id?: string;
        name?: string;
        villageId?: string;
        sizeBytes?: number;
      };
      if (
        !body.id ||
        !body.name ||
        !body.villageId ||
        !Number.isSafeInteger(body.sizeBytes) ||
        body.sizeBytes < 5
      ) {
        return NextResponse.json(
          { error: "Upload metadata is incomplete" },
          { status: 400 },
        );
      }
      if (!VILLAGES.some((item) => item.id === body.villageId)) {
        return NextResponse.json(
          { error: "A valid village is required" },
          { status: 400 },
        );
      }
      const asset = await finalizePdfUpload({
        id: body.id,
        name: path.basename(body.name),
        villageId: body.villageId,
        sizeBytes: body.sizeBytes,
      });
      return NextResponse.json(asset, { status: 201 });
    }
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "upload"
    ) {
      return NextResponse.json(
        {
          error:
            "There is only ONE upload endpoint: use POST /api/admin/pdfs with the raw PDF body (any size). Query params: village=ID&filename=ORIGINAL_NAME. PDFs are stored directly in ./pdfs/ on the app server. Supabase is used only for DB/indexing of voter records, never for file storage.",
          uploadEndpoint: "/api/admin/pdfs",
          storageLocation: "local filesystem (pdfs)",
          supabaseUsedFor: "voter database + index_jobs queue",
        },
        { status: 410 },
      );
    }
    if (
      segments.length === 2 &&
      segments[0] === "admin" &&
      segments[1] === "pdfs"
    ) {
      const authError = authorizeStreamingUpload(request);
      if (authError) return authError;
      const params = UploadPdfQueryParams.parse(query);
      const village = VILLAGES.find((item) => item.id === params.village);
      if (!village) {
        return NextResponse.json(
          { error: "A valid village is required" },
          { status: 400 },
        );
      }
      if (!request.body) {
        return NextResponse.json(
          {
            error: "No PDF data received. Please choose a PDF file and retry.",
          },
          { status: 400 },
        );
      }
      const declaredSize = Number(request.headers.get("x-pdf-size") || 0);
      const contentLength = Number(request.headers.get("content-length") || 0);
      const maxBytes = 500 * 1024 * 1024;
      const sizeHint = declaredSize || contentLength;
      if (sizeHint > maxBytes) {
        return NextResponse.json(
          { error: "PDF too large. Max upload size is 500MB." },
          { status: 413 },
        );
      }
      const id = `roll-${randomUUID()}`;
      console.log("[PDF Upload] Streaming upload started:", {
        id,
        filename: params.filename,
        village: village.id,
        declaredSize,
        contentLength: request.headers.get("content-length"),
      });
      const reader = request.body.getReader();
      const stream = (async function* bodyToBytes() {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value?.length) yield value;
        }
      })();
      const asset = await addPdfFromStream(
        id,
        params.filename,
        stream,
        village.id,
      );
      console.log("[PDF Upload] Streaming upload finished:", {
        id,
        savedAs: asset?.id,
        sizeBytes: asset?.sizeBytes,
      });
      scheduleIndexing("rebuild", asset?.id ?? id);
      return NextResponse.json(asset, { status: 201 });
    }
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "index" &&
      segments[2] === "rebuild"
    ) {
      if (isSupabaseEnabled()) {
        await queueAllIndexJobs();
        scheduleIndexing("queue");
      } else {
        scheduleIndexing("rebuild");
      }
      return NextResponse.json(
        { ...getIndexState(), status: "queued" },
        { status: 202 },
      );
    }
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const segments = await routePath(context);
  if (
    segments.length !== 3 ||
    segments[0] !== "admin" ||
    segments[1] !== "pdfs"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const { id } = RenamePdfParams.parse({ id: segments[2] });
    const { name } = RenamePdfBody.parse(await request.json());
    const pdf = await renamePdf(id, name);
    return pdf
      ? NextResponse.json(pdf)
      : NextResponse.json({ error: "PDF not found" }, { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const segments = await routePath(context);
  if (
    segments.length !== 3 ||
    segments[0] !== "admin" ||
    segments[1] !== "pdfs"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    const { id } = DeletePdfParams.parse({ id: segments[2] });
    await removePdf(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
