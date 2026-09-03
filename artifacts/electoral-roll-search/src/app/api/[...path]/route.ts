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
  addPdf,
  addPdfFromStream,
  downloadPdf,
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
import { getSupabaseAdmin, isSupabaseEnabled } from "@/server/supabase";

export const runtime = "nodejs";

export const maxDuration = 300;

export const dynamic = "force-dynamic";

export const preferredRegion = "auto";

export const fetchCache = "force-no-store";

export const bodySizeLimit = 500 * 1024 * 1024;

export const revalidate = 0;

type RouteContext = { params: Promise<{ path: string[] }> };

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
  return NextResponse.json({ error: rawMessage }, { status: 500 });
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
      segments[1] === "upload"
    ) {
      return NextResponse.json(
        {
          error:
            "There is only ONE upload endpoint: use POST /api/admin/pdfs with the raw PDF body (any size). Query params: village=ID&filename=ORIGINAL_NAME. PDFs are stored locally in ./data/pdfs/ on the app server. Supabase is used only for DB/indexing of voter records, never for file storage.",
          uploadEndpoint: "/api/admin/pdfs",
          storageLocation: "local filesystem (data/pdfs)",
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
          { error: "No PDF data received. Please choose a PDF file and retry." },
          { status: 400 },
        );
      }
      const declaredSize = Number(request.headers.get("x-pdf-size") || 0);
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
