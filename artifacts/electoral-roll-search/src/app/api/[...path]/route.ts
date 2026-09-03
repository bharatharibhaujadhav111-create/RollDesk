import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
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
      console.log("[Blob Upload Route] Received upload request");

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        console.error("[Blob Upload Route] Missing BLOB_READ_WRITE_TOKEN");
        return NextResponse.json(
          {
            error:
              "Vercel Blob is not configured. Add BLOB_READ_WRITE_TOKEN to this deployment.",
          },
          { status: 503 },
        );
      }

      // Parse request body - handle both form-data and JSON
      let body: Parameters<typeof handleUpload>[0]["body"];
      try {
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
          // This shouldn't happen with Vercel Blob SDK client, but handle it
          console.warn(
            "[Blob Upload Route] Received multipart/form-data, expected JSON",
          );
          return NextResponse.json(
            { error: "This endpoint expects Vercel Blob SDK client requests" },
            { status: 400 },
          );
        }

        const parsed = (await request.json()) as Record<string, unknown>;

        // Log what we received for debugging
        console.log("[Blob Upload Route] Parsed request body:", {
          type: parsed.type,
          hasPayload: !!parsed.payload,
          keys: Object.keys(parsed),
        });

        if (
          typeof parsed !== "object" ||
          parsed === null ||
          typeof parsed.type !== "string" ||
          typeof parsed.payload !== "object" ||
          parsed.payload === null
        ) {
          console.error("[Blob Upload Route] Invalid body structure:", parsed);
          return NextResponse.json(
            { error: "Invalid Blob upload request body structure" },
            { status: 400 },
          );
        }

        body = parsed as unknown as Parameters<typeof handleUpload>[0]["body"];
      } catch (err) {
        console.error("[Blob Upload Route] Failed to parse request:", err);
        return NextResponse.json(
          {
            error: `Request parsing error: ${err instanceof Error ? err.message : "Unknown error"}`,
          },
          { status: 400 },
        );
      }

      try {
        console.log(
          "[Blob Upload Route] Calling handleUpload with body type:",
          body.type,
        );

        const jsonResponse = await handleUpload({
          body,
          request,
          onBeforeGenerateToken: async () => {
            console.log(
              "[Blob Upload Route] Generating token - validating PDF",
            );
            return {
              allowedContentTypes: ["application/pdf"],
              maximumSizeInBytes: MAX_UPLOAD_BYTES,
            };
          },
          onUploadCompleted: async ({ blob: uploadedBlob }) => {
            console.log("[Blob Upload Route] Upload completed:", {
              pathname: uploadedBlob?.pathname,
              contentType: uploadedBlob?.contentType,
            });
            return undefined;
          },
        });

        console.log("[Blob Upload Route] handleUpload succeeded, response:", {
          keys: Object.keys(jsonResponse || {}),
        });

        // Validate response has expected shape
        if (!jsonResponse || typeof jsonResponse !== "object") {
          console.error(
            "[Blob Upload Route] Invalid response from handleUpload",
          );
          return NextResponse.json(
            { error: "Upload handler returned invalid response" },
            { status: 502 },
          );
        }

        return NextResponse.json(jsonResponse);
      } catch (err) {
        console.error("[Blob Upload Route] handleUpload failed:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);

        // Return more helpful error based on error type
        if (errorMessage.includes("PDF")) {
          return NextResponse.json(
            { error: "Only PDF files are allowed" },
            { status: 400 },
          );
        }
        if (errorMessage.includes("size") || errorMessage.includes("exceed")) {
          return NextResponse.json(
            {
              error: `File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`,
            },
            { status: 413 },
          );
        }

        return NextResponse.json(
          { error: `Upload failed: ${errorMessage}` },
          { status: 502 },
        );
      }
    }
    if (
      segments.length === 2 &&
      segments[0] === "admin" &&
      segments[1] === "blob-complete"
    ) {
      console.log("[Blob Complete Route] Received blob-complete request");

      let body: {
        pathname?: string;
        filename?: string;
        village?: string;
      };
      try {
        body = (await request.json()) as {
          pathname?: string;
          filename?: string;
          village?: string;
        };
        console.log("[Blob Complete Route] Parsed body:", {
          pathname: body.pathname,
          filename: body.filename,
          village: body.village,
        });
      } catch (err) {
        console.error("[Blob Complete Route] Request parse error:", err);
        return NextResponse.json(
          { error: "Invalid request body" },
          { status: 400 },
        );
      }

      const village = VILLAGES.find((item) => item.id === body.village);
      if (!village || !body.pathname || !body.filename) {
        console.error("[Blob Complete Route] Missing required fields:", {
          hasVillage: !!village,
          pathname: body.pathname,
          filename: body.filename,
        });
        return NextResponse.json(
          { error: "A valid file, pathname, and village are required" },
          { status: 400 },
        );
      }

      let blob;
      try {
        console.log(
          "[Blob Complete Route] Retrieving blob from:",
          body.pathname,
        );
        blob = await get(body.pathname, { access: "private" });
      } catch (err) {
        console.error(
          "[Blob Complete Route] Failed to retrieve blob from Vercel:",
          {
            pathname: body.pathname,
            error: err instanceof Error ? err.message : String(err),
          },
        );
        // Don't fail yet - might be a temporary issue, but continue with caution
        blob = null;
      }

      if (!blob) {
        console.error(
          "[Blob Complete Route] Blob not found at pathname:",
          body.pathname,
        );
        return NextResponse.json(
          {
            error:
              "The uploaded file was not found in storage. Please try uploading again.",
            details: "The Blob storage service may be temporarily unavailable.",
          },
          { status: 404 },
        );
      }

      let buffer: Buffer;
      try {
        console.log("[Blob Complete Route] Reading blob stream");
        const arrayBuffer = await new Response(blob.stream).arrayBuffer();
        buffer = Buffer.from(arrayBuffer);
        console.log("[Blob Complete Route] Read buffer, size:", buffer.length);
      } catch (err) {
        console.error("[Blob Complete Route] Failed to read blob stream:", err);
        return NextResponse.json(
          { error: "Failed to read the uploaded file from storage" },
          { status: 502 },
        );
      }

      // Validate buffer
      if (buffer.length === 0) {
        console.error("[Blob Complete Route] Buffer is empty");
        return NextResponse.json(
          { error: "The uploaded file is empty" },
          { status: 400 },
        );
      }

      if (buffer.length > MAX_UPLOAD_BYTES) {
        console.error("[Blob Complete Route] Buffer exceeds max size:", {
          size: buffer.length,
          max: MAX_UPLOAD_BYTES,
        });
        return NextResponse.json(
          {
            error: `File exceeds maximum size of ${MAX_UPLOAD_BYTES / 1024 / 1024}MB`,
          },
          { status: 413 },
        );
      }

      // Verify PDF header
      const pdfHeader = buffer.subarray(0, 5).toString();
      if (pdfHeader !== "%PDF-") {
        console.error("[Blob Complete Route] Invalid PDF header:", {
          header: pdfHeader,
        });
        return NextResponse.json(
          {
            error: "The uploaded file is not a valid PDF",
            details: `Expected PDF header, got: ${pdfHeader}`,
          },
          { status: 400 },
        );
      }

      try {
        const id = `roll-${createHash("sha256").update(body.pathname).digest("hex").slice(0, 24)}`;

        console.log("[Blob Complete Route] Adding PDF to database:", {
          id,
          village: village.id,
        });
        const asset = await addPdf(id, body.filename, buffer, village.id);

        console.log("[Blob Complete Route] PDF added successfully:", asset);
        scheduleIndexing();

        return NextResponse.json(asset, { status: 201 });
      } catch (err) {
        console.error("[Blob Complete Route] Failed to add PDF:", err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: `Failed to save PDF: ${errorMessage}` },
          { status: 500 },
        );
      }
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
      const id = `roll-${randomUUID()}`;
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
