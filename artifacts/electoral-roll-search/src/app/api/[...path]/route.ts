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
      segments[1] === "upload" &&
      segments[2] === "signed-url"
    ) {
      const database = getSupabaseAdmin();
      if (!database) {
        return NextResponse.json(
          { error: "Supabase is not configured" },
          { status: 503 },
        );
      }
      const body = (await request.json().catch(() => ({}))) as {
        filename?: string;
        size?: number;
      };
      const size = Number(body.size);
      if (
        !body.filename ||
        !body.filename.toLowerCase().endsWith(".pdf") ||
        !Number.isSafeInteger(size) ||
        size <= 0
      ) {
        return NextResponse.json(
          { error: "A valid PDF filename and size are required" },
          { status: 400 },
        );
      }
      const storagePath = `uploads/${randomUUID()}.pdf`;
      const { data, error } = await database.storage
        .from("electoral-roll-pdfs")
        .createSignedUploadUrl(storagePath, { upsert: false });
      if (error || !data) {
        return NextResponse.json(
          {
            error: `Could not create signed upload URL: ${error?.message ?? "unknown error"}`,
          },
          { status: 502 },
        );
      }
      return NextResponse.json({
        path: storagePath,
        signedUrl: data.signedUrl,
      });
    }
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "upload" &&
      segments[2] === "complete"
    ) {
      const database = getSupabaseAdmin();
      if (!database) {
        return NextResponse.json(
          { error: "Supabase is not configured" },
          { status: 503 },
        );
      }
      const body = (await request.json()) as {
        path?: string;
        filename?: string;
        village?: string;
        size?: number;
      };
      const village = VILLAGES.find((item) => item.id === body.village);
      const size = Number(body.size);
      if (
        !village ||
        !body.path?.startsWith("uploads/") ||
        !body.filename ||
        !Number.isSafeInteger(size) ||
        size <= 0
      ) {
        return NextResponse.json(
          { error: "Invalid completed upload" },
          { status: 400 },
        );
      }
      const { data: storedPdf, error: storageError } = await database.storage
        .from("electoral-roll-pdfs")
        .download(body.path);
      if (storageError || !storedPdf) {
        return NextResponse.json(
          { error: "Uploaded PDF was not found in storage" },
          { status: 404 },
        );
      }
      const buffer = Buffer.from(await storedPdf.arrayBuffer());
      if (
        buffer.length !== size ||
        buffer.subarray(0, 5).toString() !== "%PDF-"
      ) {
        await database.storage.from("electoral-roll-pdfs").remove([body.path]);
        return NextResponse.json(
          { error: "Uploaded object failed PDF validation" },
          { status: 400 },
        );
      }
      const id = `roll-${randomUUID()}`;
      const asset = await addPdf(
        id,
        body.filename,
        buffer,
        village.id,
        body.path,
      );
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
      const buffer = Buffer.from(await request.arrayBuffer());
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
