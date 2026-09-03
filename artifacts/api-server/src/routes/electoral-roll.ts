import { Router, type IRouter, raw } from "express";
import {
  GetSearchSuggestionsQueryParams,
  DeletePdfParams,
  ListPdfAssetsQueryParams,
  RenamePdfBody,
  RenamePdfParams,
  SearchElectoralRollQueryParams,
  UploadPdfQueryParams,
} from "@workspace/api-zod";
import {
  addPdf,
  ensureStorage,
  getIndexState,
  getSuggestions,
  listPdfs,
  rebuildIndex,
  removePdf,
  renamePdf,
  searchIndex,
  pdfDirectory,
} from "../lib/electoral-roll";
import fs from "node:fs";
import path from "node:path";

const router: IRouter = Router();

router.get("/search", async (req, res) => {
  const params = SearchElectoralRollQueryParams.parse(req.query);
  res.json(await searchIndex(params.q, params.page ?? 1, params.pageSize ?? 10));
});

router.get("/suggestions", async (req, res) => {
  const params = GetSearchSuggestionsQueryParams.parse(req.query);
  res.json(await getSuggestions(params.q));
});

router.get("/admin/pdfs", async (req, res) => {
  const params = ListPdfAssetsQueryParams.parse(req.query);
  res.json(await listPdfs(params.q));
});

router.post("/admin/pdfs", raw({ type: "application/octet-stream", limit: "100mb" }), async (req, res) => {
  const params = UploadPdfQueryParams.parse(req.query);
  const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (buffer.length < 5 || buffer.subarray(0, 5).toString() !== "%PDF-") {
    res.status(400).json({ error: "The uploaded file is not a valid PDF" });
    return;
  }
  const id = path.basename(params.filename, path.extname(params.filename)).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const pdf = await addPdf(id, params.filename, buffer);
  res.status(201).json(pdf);
});

router.patch("/admin/pdfs/:id", async (req, res) => {
  const { id } = RenamePdfParams.parse(req.params);
  const { name } = RenamePdfBody.parse(req.body);
  const pdf = await renamePdf(id, name);
  if (!pdf) return res.status(404).json({ error: "PDF not found" });
  return res.json(pdf);
});

router.delete("/admin/pdfs/:id", async (req, res) => {
  const { id } = DeletePdfParams.parse(req.params);
  await removePdf(id);
  res.status(204).end();
});

router.get("/admin/stats", async (_req, res) => {
  await ensureStorage();
  const pdfs = await listPdfs();
  res.json({ ...getIndexState(), totalPdfs: pdfs.length, totalRecords: getIndexState().totalRecords });
});

router.post("/admin/index/rebuild", async (_req, res) => {
  await ensureStorage();
  void rebuildIndex();
  res.status(202).json(getIndexState());
});

router.get("/files/:id", async (req, res) => {
  await ensureStorage();
  const id = path.basename(req.params.id);
  const filePath = path.join(pdfDirectory, `${id}.pdf`);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "PDF not found" });
    return;
  }
  res.type("application/pdf").sendFile(filePath);
});

export default router;