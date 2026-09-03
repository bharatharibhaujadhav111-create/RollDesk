import fs from "node:fs";
import path from "node:path";
import { get } from "@vercel/blob";
import { handleUpload } from "@vercel/blob/client";
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
  addPdf,
  ensureStorage,
  getIndexState,
  getAdminStats,
  getSuggestions,
  listPdfs,
  pdfDirectory,
  processQueuedJobs,
  queueAllIndexJobs,
  removePdf,
  renamePdf,
  searchIndex,
  VILLAGES,
} from "@/server/electoral-roll";
import { isSupabaseEnabled } from "@/server/supabase";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

function scheduleIndexing() {
  if (!isSupabaseEnabled()) return;
  after(async () => {
    try {
      await processQueuedJobs(1);
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
  const message = /client token|BLOB_READ_WRITE_TOKEN/i.test(rawMessage)
    ? "Vercel Blob is not configured. Connect a Blob store and add the Vercel-generated BLOB_READ_WRITE_TOKEN to this deployment."
    : rawMessage;
  return NextResponse.json({ error: message }, { status: 500 });
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
      scheduleIndexing();
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
      if (process.env.VERCEL && process.env.BLOB_READ_WRITE_TOKEN) {
        const blob = await get(`pdfs/${id}.pdf`, { access: "private" });
        if (blob) {
          return new NextResponse(
            await new Response(blob.stream).arrayBuffer(),
            {
              headers: { "Content-Type": "application/pdf" },
            },
          );
        }
      }
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
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
      segments.length === 2 &&
      segments[0] === "admin" &&
      segments[1] === "blob-upload"
    ) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
          {
            error:
              "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN to this deployment.",
          },
          { status: 503 },
        );
      }
      if (!process.env.BLOB_WEBHOOK_PUBLIC_KEY) {
        return NextResponse.json(
          {
            error:
              "Vercel Blob webhook key is not configured. Add BLOB_WEBHOOK_PUBLIC_KEY to this deployment.",
          },
          { status: 503 },
        );
      }
      let body: Parameters<typeof handleUpload>[0]["body"];
      try {
        const parsed = (await request.json()) as Record<string, unknown>;
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          typeof parsed.type !== "string" ||
          typeof parsed.payload !== "object" ||
          parsed.payload === null
        ) {
          return NextResponse.json(
            { error: "Invalid Blob upload request" },
            { status: 400 },
          );
        }
        body = parsed as unknown as Parameters<typeof handleUpload>[0]["body"];
      } catch {
        return NextResponse.json(
          { error: "Invalid Blob upload request" },
          { status: 400 },
        );
      }
      const jsonResponse = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async () => ({
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
        }),
        onUploadCompleted: async () => undefined,
      });
      return NextResponse.json(jsonResponse);
    }
    if (
      segments.length === 2 &&
      segments[0] === "admin" &&
      segments[1] === "blob-complete"
    ) {
      const body = (await request.json()) as {
        pathname?: string;
        filename?: string;
        village?: string;
      };
      const village = VILLAGES.find((item) => item.id === body.village);
      if (!village || !body.pathname || !body.filename) {
        return NextResponse.json(
          { error: "A valid file and village are required" },
          { status: 400 },
        );
      }
      const blob = await get(body.pathname, { access: "private" });
      if (!blob) {
        return NextResponse.json(
          { error: "The uploaded file could not be read" },
          { status: 502 },
        );
      }
      const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "The uploaded file is too large" },
          { status: 413 },
        );
      }
      if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
        return NextResponse.json(
          { error: "The uploaded file is not a valid PDF" },
          { status: 400 },
        );
      }
      const id = path
        .basename(body.filename, path.extname(body.filename))
        .replace(/[^a-z0-9-]/gi, "-")
        .toLowerCase();
      const asset = await addPdf(id, body.filename, buffer, village.id);
      scheduleIndexing();
      return NextResponse.json(asset, { status: 201 });
    }
    if (
      segments.length === 2 &&
      segments[0] === "admin" &&
      segments[1] === "pdfs"
    ) {
      const params = UploadPdfQueryParams.parse(query);
      const village = VILLAGES.find((item) => item.id === params.village);
      if (!village) {
        return NextResponse.json(
          { error: "A valid village is required" },
          { status: 400 },
        );
      }
      const contentLength = Number(request.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "The uploaded file is too large" },
          { status: 413 },
        );
      }
      const buffer = Buffer.from(await request.arrayBuffer());
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return NextResponse.json(
          { error: "The uploaded file is too large" },
          { status: 413 },
        );
      }
      if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
        return NextResponse.json(
          { error: "The uploaded file is not a valid PDF" },
          { status: 400 },
        );
      }
      const id = path
        .basename(params.filename, path.extname(params.filename))
        .replace(/[^a-z0-9-]/gi, "-")
        .toLowerCase();
      const asset = await addPdf(id, params.filename, buffer, village.id);
      scheduleIndexing();
      return NextResponse.json(asset, { status: 201 });
    }
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "index" &&
      segments[2] === "rebuild"
    ) {
      await queueAllIndexJobs();
      scheduleIndexing();
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
