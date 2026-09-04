"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Check,
  Database,
  FileArchive,
  FileText,
  HardDrive,
  Pencil,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetAdminStatsQueryKey,
  getListPdfAssetsQueryKey,
  useDeletePdf,
  useGetAdminStats,
  useListPdfAssets,
  useRenamePdf,
  useRebuildSearchIndex,
  type PdfAsset,
} from "@workspace/api-client-react";
import { StatusPill } from "@/components/status-pill";

type Village = { id: string; name: string; nameMr: string };
type AdminPdfAsset = PdfAsset & {
  villageId?: string;
  villageName?: string;
  villageNameMr?: string;
};

function formatCount(value: number | null | undefined) {
  return (value ?? 0).toLocaleString();
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function postUploadChunk(options: {
  url: string;
  chunk: Blob;
  uploadId: string;
  chunkIndex: number;
  chunkCount: number;
  totalSize: number;
  onProgress: (sentBytes: number) => void;
}) {
  return new Promise<{ error?: string; hint?: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", options.url, true);
    xhr.timeout = 120_000;
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.setRequestHeader("X-PDF-Stream", "1");
    xhr.setRequestHeader("X-Upload-Id", options.uploadId);
    xhr.setRequestHeader("X-Chunk-Index", String(options.chunkIndex));
    xhr.setRequestHeader("X-Chunk-Count", String(options.chunkCount));
    xhr.setRequestHeader("X-Upload-Total-Size", String(options.totalSize));
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) options.onProgress(event.loaded);
    };
    xhr.ontimeout = () =>
      reject(new Error("Upload timed out. Please retry."));
    xhr.onerror = () =>
      reject(new Error("Upload was interrupted mid-transfer. Please retry."));
    xhr.onload = () => {
      let body: { error?: string; hint?: string } | null = null;
      try {
        body = JSON.parse(xhr.responseText) as {
          error?: string;
          hint?: string;
        };
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body ?? {});
        return;
      }
      if (xhr.status === 401 || xhr.status === 403) {
        reject(
          new Error(
            "Server rejected credentials — refresh the page and try again.",
          ),
        );
        return;
      }
      reject(
        new Error(
          [body?.error, body?.hint].filter(Boolean).join(" ") ||
            `Chunk ${options.chunkIndex + 1}/${options.chunkCount} failed (HTTP ${xhr.status}); please retry.`,
        ),
      );
    };
    xhr.send(options.chunk);
  });
}

async function postUploadChunkWithRetry(options: {
  url: string;
  chunk: Blob;
  uploadId: string;
  chunkIndex: number;
  chunkCount: number;
  totalSize: number;
  onProgress: (sentBytes: number) => void;
}) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await postUploadChunk(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const transient =
        /HTTP (408|429|5\d\d)/.test(message) ||
        /timed out|interrupted mid-transfer/i.test(message);
      if (!transient || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error("Upload retry limit reached.");
}

function StatSkeleton() {
  return (
    <div className="h-[116px] animate-pulse rounded-xl border border-border bg-card/75" />
  );
}

const VILLAGES = [
  { id: "akolekati", name: "Akolekati", nameMr: "अकोलेकाटी" },
  { id: "banegaon", name: "Banegaon", nameMr: "बाणेगाव" },
  { id: "belati", name: "Belati", nameMr: "बेलाटी" },
  { id: "bhagaiwadi", name: "Bhagaiwadi", nameMr: "भगाईवाडी" },
  { id: "bhatewadi", name: "Bhatewadi", nameMr: "भाटेवाडी" },
  { id: "bhogaon", name: "Bhogaon", nameMr: "भोगाव" },
  { id: "darfal-bibi", name: "Darfal (Bibi)", nameMr: "दरफळ बिबी" },
  { id: "darphal-gawadi", name: "Darphal (Gawadi)", nameMr: "दरफळ गावडी" },
  { id: "dongaon", name: "Dongaon", nameMr: "डोंगाव" },
  { id: "ekrukh", name: "Ekrukh", nameMr: "एकरुख" },
  { id: "gulwanchi", name: "Gulwanchi", nameMr: "गुळवंची" },
  { id: "haglur", name: "Haglur", nameMr: "हागळूर" },
  { id: "hipparge", name: "Hipparge", nameMr: "हिप्परगे" },
  { id: "hiraj", name: "Hiraj", nameMr: "हिरज" },
  { id: "honsal", name: "Honsal", nameMr: "होंसळ" },
  { id: "kalman", name: "Kalman", nameMr: "कळमण" },
  { id: "karamba", name: "Karamba", nameMr: "करंबा" },
  { id: "kavathe", name: "Kavathe", nameMr: "कवठे" },
  { id: "khed", name: "Khed", nameMr: "खेड" },
  { id: "kondi", name: "Kondi", nameMr: "कोंडी" },
  { id: "kouthali", name: "Kouthali", nameMr: "कौठाळी" },
  { id: "mardi", name: "Mardi", nameMr: "मार्डी" },
  { id: "mohitewadi", name: "Mohitewadi", nameMr: "मोहितेवाडी" },
  { id: "nandur", name: "Nandur", nameMr: "नांदूर" },
  { id: "nannaj", name: "Nannaj", nameMr: "नान्नज" },
  { id: "narotewadi", name: "Narotewadi", nameMr: "नरोटेवाडी" },
  { id: "padsali", name: "Padsali", nameMr: "पडसाळी" },
  { id: "pakani", name: "Pakani", nameMr: "पाकणी" },
  { id: "pathari", name: "Pathari", nameMr: "पाथरी" },
  { id: "raleras", name: "Raleras", nameMr: "राळेरस" },
  { id: "ranmasle", name: "Ranmasle", nameMr: "रणमसळे" },
  { id: "sakharewadi", name: "Sakharewadi", nameMr: "साखरेवाडी" },
  { id: "samshapur", name: "Samshapur", nameMr: "शमशापूर" },
  { id: "sevalalnagar", name: "Sevalalnagar", nameMr: "सेवालालनगर" },
  { id: "shivani", name: "Shivani", nameMr: "शिवणी" },
  { id: "taratgaon", name: "Taratgaon", nameMr: "तरटगाव" },
  { id: "telgaon", name: "Telgaon", nameMr: "तेलगाव" },
  { id: "tirhe", name: "Tirhe", nameMr: "तिर्हे" },
  { id: "wadala", name: "Wadala", nameMr: "वडाळा" },
  { id: "wangi", name: "Wangi", nameMr: "Wangi" },
];

function AssetRow({
  asset,
  onChanged,
}: {
  asset: PdfAsset;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(asset.name);
  const renamePdf = useRenamePdf();
  const deletePdf = useDeletePdf();
  const saving = renamePdf.isPending || deletePdf.isPending;

  function saveName() {
    const nextName = name.trim();
    if (!nextName || nextName === asset.name) {
      setName(asset.name);
      setEditing(false);
      return;
    }
    renamePdf.mutate(
      { id: asset.id, data: { name: nextName } },
      {
        onSuccess: () => {
          setEditing(false);
          queryClient.invalidateQueries({
            queryKey: getListPdfAssetsQueryKey(),
          });
          onChanged();
        },
      },
    );
  }

  function removeAsset() {
    if (!window.confirm(`Remove “${asset.name}” and its indexed records?`))
      return;
    deletePdf.mutate(
      { id: asset.id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListPdfAssetsQueryKey(),
          });
          queryClient.invalidateQueries({
            queryKey: getGetAdminStatsQueryKey(),
          });
          onChanged();
        },
      },
    );
  }

  return (
    <div
      data-testid={`row-pdf-${asset.id}`}
      className="grid gap-4 border-b border-border/70 px-5 py-5 last:border-0 lg:grid-cols-[minmax(0,1.5fr)_110px_90px_160px_124px] lg:items-center"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
            <FileText size={17} />
          </span>
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex max-w-md items-center gap-2">
                <input
                  autoFocus
                  data-testid={`input-rename-pdf-${asset.id}`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") saveName();
                    if (event.key === "Escape") {
                      setName(asset.name);
                      setEditing(false);
                    }
                  }}
                  className="min-w-0 flex-1 rounded-md border border-accent bg-background px-2 py-1 text-sm outline-none"
                />
                <button
                  type="button"
                  aria-label="Save PDF name"
                  data-testid={`button-save-rename-${asset.id}`}
                  onClick={saveName}
                  disabled={saving}
                  className="text-emerald-700"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  aria-label="Cancel rename"
                  data-testid={`button-cancel-rename-${asset.id}`}
                  onClick={() => {
                    setName(asset.name);
                    setEditing(false);
                  }}
                  className="text-muted-foreground"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <p className="truncate text-sm font-bold text-foreground">
                {asset.name}
              </p>
            )}
            <p className="mt-0.5 font-mono-app text-[10px] uppercase tracking-[.08em] text-muted-foreground">
              {formatBytes(asset.sizeBytes)} · uploaded{" "}
              {formatDate(asset.uploadedAt)}
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between lg:block">
        <p className="font-mono-app text-[9px] uppercase tracking-[.1em] text-muted-foreground lg:hidden">
          Pages
        </p>
        <p className="font-mono-app text-sm font-bold">
          {formatCount(asset.pageCount)}
        </p>
      </div>
      <div className="flex items-center justify-between lg:block">
        <p className="font-mono-app text-[9px] uppercase tracking-[.1em] text-muted-foreground lg:hidden">
          Records
        </p>
        <p className="font-mono-app text-sm font-bold">
          {formatCount(asset.indexedRecords)}
        </p>
      </div>
      <div className="flex items-center justify-between lg:block">
        <p className="font-mono-app text-[9px] uppercase tracking-[.1em] text-muted-foreground lg:hidden">
          Status
        </p>
        <StatusPill status={asset.status} />
      </div>
      <div className="flex items-center justify-end gap-1 border-t border-border/60 pt-3 lg:border-0 lg:pt-0">
        {asset.fileUrl ? (
          <a
            data-testid={`link-download-pdf-${asset.id}`}
            href={asset.fileUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label={`Open ${asset.name}`}
          >
            <FileArchive size={16} />
          </a>
        ) : null}
        <button
          type="button"
          data-testid={`button-edit-pdf-${asset.id}`}
          disabled={saving}
          onClick={() => setEditing(true)}
          className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={`Rename ${asset.name}`}
        >
          <Pencil size={16} />
        </button>
        <button
          type="button"
          data-testid={`button-delete-pdf-${asset.id}`}
          disabled={saving}
          onClick={removeAsset}
          className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={`Delete ${asset.name}`}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState("");
  const [village, setVillage] = useState("tirhe");
  const [viewVillage, setViewVillage] = useState("all");
  const [uploadVillageOpen, setUploadVillageOpen] = useState(false);
  const [villages, setVillages] = useState<Village[]>(VILLAGES);
  const [villagesLoading, setVillagesLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [notice, setNotice] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{
    file: string;
    percent: number;
    loadedMB: number;
    totalMB: number;
  } | null>(null);

  const MAX_UPLOAD_MB = 500;
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

  useEffect(() => {
    fetch("/api/villages")
      .then(async (res) => {
        if (!res.ok)
          throw new Error(`Village list request failed (${res.status})`);
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error("Village list is empty");
        }
        return data as Village[];
      })
      .then((data) => {
        setVillages(data);
        setVillagesLoading(false);
      })
      .catch(() => {
        setVillagesLoading(false);
      });
  }, []);

  const pdfParams = filter ? { q: filter } : undefined;
  const statsQuery = useGetAdminStats({
    query: {
      queryKey: getGetAdminStatsQueryKey(),
      refetchInterval: uploading ? false : 3000,
    },
  });
  const assetsQuery = useListPdfAssets(pdfParams, {
    query: {
      queryKey: getListPdfAssetsQueryKey(pdfParams),
      refetchInterval: uploading ? false : 3000,
    },
  });
  const rebuildIndex = useRebuildSearchIndex();
  const stats = statsQuery.data;
  const assets = (assetsQuery.data || []) as AdminPdfAsset[];
  const visibleAssets =
    viewVillage === "all"
      ? assets
      : assets.filter((asset) => asset.villageId === viewVillage);
  const villageGroups = villages
    .map((item) => ({
      ...item,
      assets: visibleAssets.filter((asset) => asset.villageId === item.id),
    }))
    .filter((group) => group.assets.length > 0);
  const uncategorizedAssets = visibleAssets.filter(
    (asset) => !villages.some((item) => item.id === asset.villageId),
  );
  const displayVillageGroups = uncategorizedAssets.length
    ? [
        ...villageGroups,
        {
          id: "uncategorized",
          name: "Uncategorized",
          nameMr: "",
          assets: uncategorizedAssets,
        },
      ]
    : villageGroups;
  const noPdfAssets =
    assetsQuery.isError &&
    (assetsQuery.error as { status?: number } | null)?.status === 404;

  async function uploadFile(file?: File) {
    if (!file) return false;
    setUploadError("");
    setNotice("");
    setUploadProgress(null);
    if (
      file.type !== "application/pdf" &&
      !file.name.toLowerCase().endsWith(".pdf")
    ) {
      setUploadError("Please choose a PDF file.");
      return false;
    }
    if (file.size < 5) {
      setUploadError(`${file.name} is empty and cannot be uploaded.`);
      return false;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(
        `${file.name} is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The upload limit is ${MAX_UPLOAD_MB} MB per PDF.`,
      );
      return false;
    }
    const header = await new Promise<Uint8Array | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.error) resolve(null);
        else resolve(new Uint8Array(reader.result as ArrayBuffer));
      };
      reader.onerror = () => resolve(null);
      reader.readAsArrayBuffer(file.slice(0, 5));
    });
    if (
      !header ||
      header.length < 5 ||
      String.fromCharCode(...Array.from(header.slice(0, 5))) !== "%PDF-"
    ) {
      setUploadError(
        `${file.name} does not start with the %PDF- magic header. Is this a real PDF?`,
      );
      return false;
    }
    try {
      const uploadName = `${Date.now()}-${crypto.randomUUID()}-${file.name}`;
      const totalMB = file.size / (1024 * 1024);
      setUploadProgress({
        file: file.name,
        percent: 1,
        loadedMB: 0,
        totalMB,
      });
      // Hosts like Vercel reject single request bodies above ~4.5 MB (HTTP 413).
      // Upload in 2 MB chunks with XHR progress so the bar moves immediately.
      const chunkSize = 2 * 1024 * 1024;
      const chunkCount = Math.ceil(file.size / chunkSize) || 1;
      const uploadId = `roll-${crypto.randomUUID()}`;
      console.log("[PDF Upload] Chunked upload:", {
        uploadName,
        uploadId,
        size: file.size,
        sizeMB: totalMB.toFixed(2),
        chunkCount,
        chunkSize,
      });
      await fetch("/api/healthz").catch(() => undefined);

      for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(file.size, start + chunkSize);
        await postUploadChunkWithRetry({
          url: `/api/admin/pdfs/chunk?village=${encodeURIComponent(village)}&filename=${encodeURIComponent(uploadName)}`,
          chunk: file.slice(start, end),
          uploadId,
          chunkIndex,
          chunkCount,
          totalSize: file.size,
          onProgress: (sentBytes) => {
            const loaded = Math.min(file.size, start + sentBytes);
            setUploadProgress({
              file: file.name,
              percent: Math.max(1, Math.round((loaded / file.size) * 100)),
              loadedMB: loaded / (1024 * 1024),
              totalMB,
            });
          },
        });
        setUploadProgress({
          file: file.name,
          percent: Math.round((end / file.size) * 100),
          loadedMB: end / (1024 * 1024),
          totalMB,
        });
      }

      setUploadProgress({
        file: file.name,
        percent: 100,
        loadedMB: totalMB,
        totalMB,
      });
      setNotice(`${file.name} uploaded successfully. Indexing started.`);
      queryClient.invalidateQueries({ queryKey: getListPdfAssetsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
      return true;
    } catch (error) {
      const raw =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "The upload was interrupted. Please try again.";
      let message = raw;
      if (/401|403|credentials|authentication/i.test(raw)) {
        message =
          "Server rejected credentials — refresh the page and try again.";
      } else if (/not a valid pdf|magic header/i.test(raw)) {
        message = "Not a valid PDF (magic header mismatch).";
      } else if (/interrupted|network error/i.test(raw)) {
        message = "Upload was interrupted mid-transfer. Please retry.";
      }
      console.error("[PDF Upload] Fatal error:", raw);
      setUploadError(`Upload failed: ${message}`);
      return false;
    }
  }

  async function uploadFiles(files: File[]) {
    if (files.length === 0) return;
    const selected = files;
    const invalid = selected.find(
      (file) =>
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf"),
    );
    if (invalid) {
      setUploadError(`${invalid.name} is not a PDF file.`);
      return;
    }
    setUploading(true);
    try {
      for (const file of selected) {
        const uploaded = await uploadFile(file);
        if (!uploaded) break;
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function rebuild() {
    setNotice("");
    rebuildIndex.mutate(undefined, {
      onSuccess: () => {
        setNotice("Search index rebuild started in the background.");
        queryClient.invalidateQueries({ queryKey: getGetAdminStatsQueryKey() });
      },
      onError: () =>
        setUploadError("The index could not be rebuilt. Try again."),
    });
  }

  return (
    <main className="mx-auto max-w-[1240px] px-5 py-10 sm:px-8 sm:py-14">
      <div className="flex flex-col justify-between gap-6 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.16em] text-accent">
            Admin desk / collection health
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-[-.06em] text-primary sm:text-5xl">
            Keep the rolls findable.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Manage source PDFs and watch the local index as it turns paper into
            dependable search.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono-app text-[10px] uppercase tracking-[.1em] text-muted-foreground">
          <span className="size-2 rounded-full bg-emerald-700" /> Admin access
        </div>
      </div>

      <section
        className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Index statistics"
      >
        {statsQuery.isLoading ? (
          <>
            {[1, 2, 3, 4].map((item) => (
              <StatSkeleton key={item} />
            ))}
          </>
        ) : statsQuery.isError ? (
          <div
            className="col-span-full rounded-xl border border-destructive/25 bg-destructive/5 p-6 text-sm"
            data-testid="error-admin-stats"
          >
            <AlertCircle className="mb-2 text-destructive" size={20} />
            <p className="font-bold">Health data unavailable</p>
            <button
              type="button"
              data-testid="button-retry-admin-stats"
              onClick={() => statsQuery.refetch()}
              className="mt-3 font-semibold text-accent underline"
            >
              Retry
            </button>
          </div>
        ) : stats ? (
          <>
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between">
                <p className="font-mono-app text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  Source PDFs
                </p>
                <FileArchive size={17} className="text-accent" />
              </div>
              <p
                data-testid="text-total-pdfs"
                className="mt-4 text-3xl font-bold tracking-[-.05em] text-primary"
              >
                {formatCount(stats.totalPdfs)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                managed documents
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between">
                <p className="font-mono-app text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  Indexed records
                </p>
                <Database size={17} className="text-accent" />
              </div>
              <p
                data-testid="text-total-records"
                className="mt-4 text-3xl font-bold tracking-[-.05em] text-primary"
              >
                {formatCount(stats.totalRecords)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                available to search
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between">
                <p className="font-mono-app text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  Index status
                </p>
                <Activity size={17} className="text-accent" />
              </div>
              <div className="mt-4">
                <StatusPill status={stats.status} />
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                version {stats.indexVersion}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between">
                <p className="font-mono-app text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  Last indexed
                </p>
                <HardDrive size={17} className="text-accent" />
              </div>
              <p
                data-testid="text-last-indexed"
                className="mt-4 text-sm font-bold text-primary"
              >
                {formatDate(stats.lastIndexedAt)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {stats.progress}% complete
              </p>
            </div>
          </>
        ) : null}
      </section>

      {stats && stats.progress > 0 && stats.progress < 100 ? (
        <div
          className="mt-5 rounded-xl border border-accent/25 bg-accent/5 p-4"
          data-testid="status-index-progress"
        >
          <div className="flex items-center justify-between text-sm font-bold">
            <span>Indexing in progress</span>
            <span className="font-mono-app text-accent">{stats.progress}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${stats.progress}%` }}
            />
          </div>
        </div>
      ) : null}
      {stats ? (
        <section
          className="mt-5 rounded-xl border border-border bg-card p-5"
          aria-label="Index coverage details"
        >
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.14em] text-accent">
                Index coverage
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                How much usable detail was recovered from the source PDFs.
              </p>
            </div>
            <p className="font-mono-app text-[10px] uppercase tracking-[.1em] text-muted-foreground">
              {stats.indexedPdfs}/{stats.totalPdfs} PDFs completed ·{" "}
              {stats.ocrPages} OCR pages
            </p>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-secondary/55 p-3">
              <p className="font-mono-app text-[9px] uppercase tracking-[.1em] text-muted-foreground">
                EPIC captured
              </p>
              <p className="mt-1 text-lg font-bold text-primary">
                {formatCount(stats.recordsWithEpic)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/55 p-3">
              <p className="font-mono-app text-[9px] uppercase tracking-[.1em] text-muted-foreground">
                Relative names
              </p>
              <p className="mt-1 text-lg font-bold text-primary">
                {formatCount(stats.recordsWithRelativeName)}
              </p>
            </div>
            <div className="rounded-lg bg-secondary/55 p-3">
              <p className="font-mono-app text-[9px] uppercase tracking-[.1em] text-muted-foreground">
                Detailed records
              </p>
              <p className="mt-1 text-lg font-bold text-primary">
                {formatCount(stats.recordsWithDetails)}
              </p>
            </div>
          </div>
          {stats.warnings.length > 0 ? (
            <div className="mt-4 rounded-lg border border-amber-700/20 bg-amber-700/5 p-3 text-xs text-amber-900">
              <p className="font-bold">
                {stats.failedPdfs} PDF{stats.failedPdfs === 1 ? "" : "s"} need
                attention
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {stats.warnings.slice(0, 5).map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="mt-10">
        <div className="mb-4 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold tracking-[-.03em] text-primary">
              Source PDFs
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The files behind every public result.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="button-rebuild-index"
              onClick={rebuild}
              disabled={rebuildIndex.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs font-bold transition-colors hover:bg-secondary disabled:opacity-50"
            >
              <RefreshCw
                size={14}
                className={rebuildIndex.isPending ? "animate-spin" : ""}
              />{" "}
              {rebuildIndex.isPending ? "Rebuilding" : "Rebuild index"}
            </button>
            <button
              type="button"
              data-testid="button-upload-pdf"
              onClick={() => setUploadVillageOpen(true)}
              disabled={villagesLoading || uploading}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Upload size={14} />{" "}
              {villagesLoading
                ? "Loading villages"
                : uploading
                  ? "Uploading"
                  : "Upload PDF"}
            </button>
            <input
              ref={inputRef}
              data-testid="input-upload-pdf"
              type="file"
              multiple
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                const selectedFiles = Array.from(
                  event.currentTarget.files ?? [],
                );
                event.currentTarget.value = "";
                void uploadFiles(selectedFiles).catch(() => {
                  setUploading(false);
                  setUploadError(
                    "Upload failed unexpectedly. Please choose the PDF again.",
                  );
                });
              }}
            />
          </div>
        </div>
        {uploadVillageOpen ? (
          <div
            className="mb-4 rounded-xl border border-accent/30 bg-accent/5 p-5"
            role="dialog"
            aria-labelledby="upload-village-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  id="upload-village-title"
                  className="font-bold text-primary"
                >
                  Choose village for these PDFs
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  All files selected next will be assigned to this village.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUploadVillageOpen(false)}
                aria-label="Close village selection"
              >
                <X size={16} />
              </button>
            </div>
            <label
              className="mt-4 block text-sm font-bold text-primary"
              htmlFor="admin-village"
            >
              गाव / Village
            </label>
            <select
              id="admin-village"
              data-testid="select-upload-village"
              value={village}
              onChange={(event) => setVillage(event.target.value)}
              disabled={villagesLoading}
              className="mt-2 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm font-bold sm:max-w-sm disabled:opacity-50"
            >
              {villages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} / {item.nameMr}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="button-confirm-upload-village"
              onClick={() => {
                setUploadVillageOpen(false);
                inputRef.current?.click();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
            >
              <Upload size={14} /> Choose PDFs
            </button>
          </div>
        ) : null}
        {uploadProgress ? (
          <div
            className="mb-4 rounded-lg border border-accent/30 bg-accent/5 px-4 py-3 text-sm"
            data-testid="upload-progress"
          >
            <div className="flex items-center justify-between text-xs font-bold text-primary">
              <span className="truncate pr-3">{uploadProgress.file}</span>
              <span className="font-mono-app text-accent">
                {uploadProgress.loadedMB.toFixed(1)} /{" "}
                {uploadProgress.totalMB.toFixed(1)} MB ({uploadProgress.percent}
                %)
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-accent transition-all"
                style={{ width: `${uploadProgress.percent}%` }}
              />
            </div>
          </div>
        ) : null}
        {(uploadError || notice) && (
          <div
            className={`mb-4 flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${uploadError ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-emerald-700/20 bg-emerald-700/5 text-emerald-800"}`}
            data-testid={
              uploadError ? "error-admin-action" : "status-admin-action"
            }
            aria-live="polite"
          >
            <span>{uploadError || notice}</span>
            <button
              type="button"
              data-testid="button-dismiss-admin-notice"
              onClick={() => {
                setUploadError("");
                setNotice("");
              }}
              aria-label="Dismiss message"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-mono-app text-[10px] font-bold uppercase tracking-[.14em] text-accent">
              Browse by village
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              View and manage PDFs from one village at a time.
            </p>
          </div>
          <select
            data-testid="select-view-village"
            value={viewVillage}
            onChange={(event) => setViewVillage(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold text-primary outline-none focus:border-accent sm:max-w-xs"
            aria-label="View PDFs by village"
          >
            <option value="all">All villages ({assets.length})</option>
            {villages.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} / {item.nameMr} (
                {assets.filter((asset) => asset.villageId === item.id).length})
              </option>
            ))}
          </select>
        </div>
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <SearchIcon />
          <input
            data-testid="input-filter-pdfs"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by filename"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/65"
          />
          <span className="font-mono-app text-[10px] uppercase tracking-[.1em] text-muted-foreground">
            {visibleAssets.length} files
          </span>
        </div>
        {visibleAssets.length > 0 &&
        !assetsQuery.isLoading &&
        !assetsQuery.isError ? (
          <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
            {displayVillageGroups.map((group) => (
              <a
                key={group.id}
                href={`#village-${group.id}`}
                className="shrink-0 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-primary transition-colors hover:border-accent hover:bg-accent/5"
              >
                {group.name} / {group.nameMr} ({group.assets.length})
              </a>
            ))}
          </div>
        ) : null}
        <div className="space-y-4">
          {assetsQuery.isLoading ? (
            <div className="space-y-3 p-5" data-testid="loading-pdf-assets">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-16 animate-pulse rounded-lg bg-secondary/60"
                />
              ))}
            </div>
          ) : assetsQuery.isError && !noPdfAssets ? (
            <div className="p-10 text-center" data-testid="error-pdf-assets">
              <AlertCircle className="mx-auto text-destructive" size={22} />
              <p className="mt-3 text-sm font-bold">
                Could not load PDF assets
              </p>
              <button
                type="button"
                data-testid="button-retry-pdf-assets"
                onClick={() => assetsQuery.refetch()}
                className="mt-3 text-sm font-semibold text-accent underline"
              >
                Retry
              </button>
            </div>
          ) : visibleAssets.length === 0 ? (
            <div className="p-10 text-center" data-testid="empty-pdf-assets">
              <FileArchive
                className="mx-auto text-muted-foreground"
                size={24}
              />
              <p className="mt-3 text-sm font-bold text-primary">
                No PDFs in this view
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {filter
                  ? "Try a different filename."
                  : "Upload your first electoral roll PDF to begin."}
              </p>
            </div>
          ) : (
            displayVillageGroups.map((group) => (
              <section
                key={group.id}
                id={`village-${group.id}`}
                className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-sm)]"
              >
                <div className="flex items-center justify-between gap-4 border-b border-border bg-secondary/45 px-5 py-4">
                  <div>
                    <h3 className="text-base font-bold text-primary">
                      {group.name}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {group.nameMr} · village PDF collection
                    </p>
                  </div>
                  <span className="rounded-full bg-primary px-3 py-1 font-mono-app text-[10px] font-bold uppercase tracking-[.08em] text-primary-foreground">
                    {group.assets.length} PDFs
                  </span>
                </div>
                <div className="hidden grid-cols-[minmax(0,1.5fr)_110px_90px_160px_124px] gap-4 border-b border-border/70 bg-secondary/20 px-5 py-3 font-mono-app text-[9px] uppercase tracking-[.12em] text-muted-foreground lg:grid">
                  <span>Document</span>
                  <span>Pages</span>
                  <span>Records</span>
                  <span>Status</span>
                  <span className="text-right">Actions</span>
                </div>
                {group.assets.map((asset) => (
                  <AssetRow key={asset.id} asset={asset} onChanged={() => {}} />
                ))}
              </section>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function SearchIcon() {
  return (
    <span className="text-muted-foreground" aria-hidden="true">
      <FileText size={16} />
    </span>
  );
}
