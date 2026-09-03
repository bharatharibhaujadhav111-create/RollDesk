import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
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
  getSuggestions,
  listPdfs,
  pdfDirectory,
  rebuildIndex,
  removePdf,
  renamePdf,
  searchIndex,
} from "@workspace/api-server/lib/electoral-roll";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Invalid request";
  return NextResponse.json({ error: message }, { status: 400 });
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
    if (segments.length === 1 && segments[0] === "search") {
      const params = SearchElectoralRollQueryParams.parse(query);
      return NextResponse.json(
        await searchIndex(params.q, params.page, params.pageSize),
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
      const state = getIndexState();
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
      if (!fs.existsSync(filePath))
        return NextResponse.json({ error: "PDF not found" }, { status: 404 });
      return new NextResponse(await fs.promises.readFile(filePath), {
        headers: { "Content-Type": "application/pdf" },
      });
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
      segments[1] === "pdfs"
    ) {
      const params = UploadPdfQueryParams.parse(query);
      const buffer = Buffer.from(await request.arrayBuffer());
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
      return NextResponse.json(await addPdf(id, params.filename, buffer), {
        status: 201,
      });
    }
    if (
      segments.length === 3 &&
      segments[0] === "admin" &&
      segments[1] === "index" &&
      segments[2] === "rebuild"
    ) {
      await ensureStorage();
      void rebuildIndex();
      return NextResponse.json(getIndexState(), { status: 202 });
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
