import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const serviceRoot = path.resolve(process.cwd());
const projectRoot = path.resolve(serviceRoot, "../..");
export const pdfDirectory = process.env.ELECTORAL_ROLL_PDF_DIR
  ? path.resolve(process.env.ELECTORAL_ROLL_PDF_DIR)
  : path.join(projectRoot, "pdfs");
const indexPath = path.join(projectRoot, "pdf-index.json");
const statePath = path.join(projectRoot, "pdf-index-state.json");
const villagePath = path.join(projectRoot, "pdf-villages.json");
const INDEX_FORMAT_VERSION = 4;
export const VILLAGES = [
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
] as const;
const DEFAULT_VILLAGE_ID = "tirhe";
let villageAssignments: Record<string, string> = {};

export type RollRecord = {
  id: string;
  voterName: string;
  relativeName: string;
  relativeLabel: string;
  epicNumber: string | null;
  serialNumber: string | null;
  houseNumber: string | null;
  age: number | null;
  gender: string | null;
  partNumber: string;
  pageNumber: number;
  pdfName: string;
  pdfId: string;
  confidence: number;
  score?: number;
  matchedBy?: string[];
  villageId?: string;
};

export type IndexState = {
  totalPdfs: number;
  totalRecords: number;
  status: "ready" | "indexing" | "error";
  lastIndexedAt: string | null;
  indexVersion: number;
  progress: number;
  indexedPdfs: number;
  failedPdfs: number;
  ocrPages: number;
  recordsWithEpic: number;
  recordsWithRelativeName: number;
  recordsWithDetails: number;
  warnings: string[];
};

let records: RollRecord[] = [];
let state: IndexState = {
  totalPdfs: 0,
  totalRecords: 0,
  status: "ready",
  lastIndexedAt: null,
  indexVersion: INDEX_FORMAT_VERSION,
  progress: 100,
  indexedPdfs: 0,
  failedPdfs: 0,
  ocrPages: 0,
  recordsWithEpic: 0,
  recordsWithRelativeName: 0,
  recordsWithDetails: 0,
  warnings: [],
};
let initialized = false;
let rebuildRequested = false;

function clean(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function villageForPdf(pdfId: string) {
  return villageAssignments[pdfId] ?? DEFAULT_VILLAGE_ID;
}

function soundex(value: string) {
  const word = clean(value).replace(/\s+/g, "").toUpperCase();
  if (!word) return "";
  const map: Record<string, string> = {
    B: "1",
    F: "1",
    P: "1",
    V: "1",
    C: "2",
    G: "2",
    J: "2",
    K: "2",
    Q: "2",
    S: "2",
    X: "2",
    Z: "2",
    D: "3",
    T: "3",
    L: "4",
    M: "5",
    N: "5",
    R: "6",
  };
  let result = word[0];
  let previous = map[word[0]] ?? "";
  for (const char of word.slice(1)) {
    const code = map[char] ?? "";
    if (code && code !== previous) result += code;
    previous = code;
  }
  return (result + "000").slice(0, 4);
}

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] =
        a[i - 1] === b[j - 1]
          ? diagonal
          : Math.min(diagonal + 1, row[j] + 1, row[j - 1] + 1);
      diagonal = above;
    }
  }
  return row[b.length];
}

function wordScore(query: string, target: string) {
  const q = clean(query);
  const t = clean(target);
  if (!q || !t) return 0;
  if (t === q) return 1;
  if (t.includes(q)) return 0.96;
  const qWords = q.split(" ");
  const tWords = t.split(" ");
  const scores = qWords.map((part) => {
    const best = tWords.reduce((current, targetWord) => {
      const distance = editDistance(part, targetWord);
      const fuzzy = 1 - distance / Math.max(part.length, targetWord.length);
      const phonetic = soundex(part) === soundex(targetWord) ? 0.78 : 0;
      return Math.max(current, fuzzy, phonetic);
    }, 0);
    return best;
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

export function parseSearchQuery(query: string) {
  const epic =
    query.match(/\b(?:[A-Z]{1,4}\d{2,}|\d{5,})\b/i)?.[0]?.toUpperCase() ?? null;
  const fatherMatch = query.match(
    /\b(?:father|husband)(?:'s)?\s+(?:is|named|name\s+is)?\s*([a-z][a-z .'-]+)/i,
  );
  const relativeName =
    fatherMatch?.[1]?.trim().replace(/\s+(?:and|for|in|from)\s*$/i, "") || null;
  let name = query.replace(
    /\b(?:find|show|search|locate|voter|whose|with|the|please)\b/gi,
    " ",
  );
  if (fatherMatch) name = name.replace(fatherMatch[0], " ");
  if (epic) name = name.replace(epic, " ");
  name = name.replace(/\s+/g, " ").trim();
  return { name: name || null, relativeName, epicNumber: epic };
}

type ExtractedPage = {
  pageNumber: number;
  text: string;
  epicText?: string;
  usedOcr: boolean;
};

function splitColumns(line: string) {
  if (/[|,;]/.test(line))
    return line
      .split(/\s*[|,;]\s*/)
      .map((column) => column.trim())
      .filter(Boolean);
  if (/\t|\s{2,}/.test(line))
    return line
      .split(/\t+|\s{2,}/)
      .map((column) => column.trim())
      .filter(Boolean);
  return [line.trim()];
}

type LabeledField = { label: string; value: string };

function readLabeledFields(line: string): LabeledField[] {
  const labels =
    /(?<!['’A-Za-z])((?:father['’]s|husband['’]s|mother['’]s|guardian['’]s)\s+name|name|house\s+number|age|gender|sex)\s*:\s*/gi;
  const matches = Array.from(line.matchAll(labels));
  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = matches[index + 1]?.index ?? line.length;
      return {
        label: match[1].toLowerCase().replace(/\s+/g, " ").trim(),
        value: line
          .slice(start, end)
          .trim()
          .replace(/\s+(?:Photo|Available)\s*$/i, "")
          .trim(),
      };
    })
    .filter((field) => field.value && !/^house number$/i.test(field.value));
}

function isLikelyName(value: string) {
  return (
    value.length >= 3 &&
    /[a-z\u0900-\u097f]{2}/i.test(value) &&
    !/\b(?:electoral|roll|details|available|facing|north|south|east|west|police|station|school|room|class|taluka|district|date|publication|assembly|constituency|reservation|polling|part\s*no|total\s+pages|page\s+\d|address|map|view|galli|chowk)\b/i.test(
      value,
    )
  );
}

function confidenceForRecord(record: {
  relativeName: string;
  epicNumber: string | null;
  serialNumber: string | null;
  houseNumber: string | null;
  age: number | null;
  gender: string | null;
}) {
  const details = [
    record.epicNumber,
    record.serialNumber,
    record.houseNumber,
    record.age,
    record.gender,
  ].filter((value) => value !== null).length;
  return Number(
    Math.min(
      1,
      0.42 +
        (record.relativeName ? 0.18 : 0) +
        (record.epicNumber ? 0.18 : 0) +
        (record.serialNumber ? 0.08 : 0) +
        (details >= 3 ? 0.14 : details > 0 ? 0.07 : 0),
    ).toFixed(2),
  );
}

function parseLabeledGrid(
  text: string,
  pdfName: string,
  pdfId: string,
  pageNumber: number,
  partNumber: string,
) {
  let current: Array<{
    voterName: string;
    relativeName: string;
    relativeLabel: string;
    houseNumber: string | null;
    age: number | null;
    gender: string | null;
  }> = [];
  const output: RollRecord[] = [];
  let rowNumber = 0;
  const flush = () => {
    for (const [index, draft] of current.entries()) {
      if (!isLikelyName(draft.voterName)) continue;
      const record = {
        id: `${pdfId}-${pageNumber}-${rowNumber}-${index}`,
        voterName: draft.voterName,
        relativeName: draft.relativeName,
        relativeLabel: draft.relativeLabel,
        epicNumber: null,
        serialNumber: null,
        houseNumber: draft.houseNumber,
        age: draft.age,
        gender: draft.gender,
        partNumber,
        pageNumber,
        pdfName,
        pdfId,
        confidence: confidenceForRecord({
          ...draft,
          epicNumber: null,
          serialNumber: null,
        }),
      };
      output.push(record);
    }
    if (current.length > 0) rowNumber += 1;
    current = [];
  };

  for (const line of text.split(/\r?\n/)) {
    const fields = readLabeledFields(line.trim());
    if (fields.length === 0) continue;
    const names = fields.filter((field) => field.label === "name");
    if (names.length > 0) {
      flush();
      current = names.map((field) => ({
        voterName: field.value,
        relativeName: "",
        relativeLabel: "Father's Name",
        houseNumber: null,
        age: null,
        gender: null,
      }));
    }
    if (current.length === 0) continue;
    const relatives = fields.filter((field) =>
      /^(?:father's|husband's|mother's|guardian's) name$/.test(field.label),
    );
    const ages = fields
      .filter((field) => field.label === "age")
      .map((field) => Number(field.value.replace(/\D/g, "")))
      .filter((value) => value >= 0 && value <= 130);
    const genders = fields
      .filter((field) => field.label === "gender" || field.label === "sex")
      .map((field) =>
        /^(?:m|male|पुरुष)$/i.test(field.value)
          ? "Male"
          : /^(?:f|female|महिला)$/i.test(field.value)
            ? "Female"
            : "Other",
      );
    const houses = fields
      .filter((field) => field.label === "house number")
      .map((field) =>
        /^(?:photo|available)$/i.test(field.value) ? null : field.value || null,
      );
    relatives.forEach((field, index) => {
      if (current[index]) {
        current[index].relativeName = field.value;
        current[index].relativeLabel = field.label.startsWith("husband")
          ? "Husband's Name"
          : field.label.startsWith("mother") ||
              field.label.startsWith("guardian")
            ? "Guardian's Name"
            : "Father's Name";
      }
    });
    ages.forEach((value, index) => {
      if (current[index]) current[index].age = value;
    });
    genders.forEach((value, index) => {
      if (current[index]) current[index].gender = value;
    });
    houses.forEach((value, index) => {
      if (current[index]) current[index].houseNumber = value;
    });
  }
  flush();
  return output;
}

function headerIndex(headers: string[], aliases: RegExp) {
  return headers.findIndex((header) =>
    aliases.test(clean(header).replace(/\s+/g, " ")),
  );
}

function columnValue(
  columns: string[],
  headers: string[] | null,
  aliases: RegExp,
) {
  if (!headers) return null;
  const index = headerIndex(headers, aliases);
  return index >= 0 ? columns[index] || null : null;
}

function parseTextRecords(
  text: string,
  pdfName: string,
  pdfId: string,
  pageNumber = 1,
  epicText = text,
) {
  const lines = text.split(/\r?\n/);
  let headers: string[] | null = null;
  const pagePart =
    text.match(
      /\b(?:part|polling\s+part|bhag)\s*(?:no\.?|number)?\s*[:\-]?\s*(\d{1,4})\b/i,
    )?.[1] ?? "—";
  const labeledRecords = parseLabeledGrid(
    text,
    pdfName,
    pdfId,
    pageNumber,
    pagePart,
  );
  if (labeledRecords.length > 0) {
    const epics = Array.from(epicText.matchAll(/\b[A-Z0-9]{8,12}\b/gi))
      .map((match) => match[0].toUpperCase())
      .filter((value) => /[A-Z]/.test(value) && /\d/.test(value));
    return labeledRecords.map((record, index) => {
      const epicNumber = epics[index] ?? null;
      return {
        ...record,
        epicNumber,
        confidence: confidenceForRecord({ ...record, epicNumber }),
      };
    });
  }

  return lines.flatMap((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 4) return [];
    const columns = splitColumns(trimmed);
    const normalized = clean(trimmed);
    const looksLikeHeader =
      /\b(?:name|epic|age|gender|sex|father|husband|house|serial|part)\b/i.test(
        normalized,
      ) && !/\b[A-Z]{2,4}\d{5,}\b/i.test(trimmed);
    if (looksLikeHeader && columns.length >= 2) {
      headers = columns;
      return [];
    }
    if (
      /^(?:electoral|photo|identity|assembly|constituency|polling|total|page)\b/i.test(
        trimmed,
      )
    )
      return [];

    const epicMatch = trimmed.match(/\b[A-Z]{2,4}\d{5,}\b/i);
    const epic =
      columnValue(columns, headers, /\b(?:epic|voter\s*id|card)\b/i) ||
      epicMatch?.[0]?.toUpperCase() ||
      null;
    const serial =
      columnValue(columns, headers, /\b(?:serial|sr)\b/i) ||
      trimmed.match(/^\s*(\d{1,6})(?=\s|[|,;])/)?.[1] ||
      null;
    const voterFromColumns = columnValue(
      columns,
      headers,
      /\b(?:voter|elector|name)\b/i,
    );
    const relativeFromColumns = columnValue(
      columns,
      headers,
      /\b(?:father|husband|mother|guardian|relative)\b/i,
    );
    let voterName = voterFromColumns?.trim() || "";
    let relativeName = relativeFromColumns?.trim() || "";

    if (!voterName && columns.length >= 2 && !epicMatch) {
      voterName = columns[0];
      relativeName = columns[1] || "";
    }
    if (!voterName && epicMatch && columns.length >= 3) {
      const epicColumnIndex = columns.findIndex((column) =>
        new RegExp(`^${epicMatch[0]}$`, "i").test(column),
      );
      const nameCandidates = columns
        .slice(0, epicColumnIndex)
        .filter(
          (column) =>
            /[a-z\u0900-\u097f]{2}/i.test(column) && !/^\d+$/.test(column),
        );
      voterName = nameCandidates[nameCandidates.length - 1] || "";
      relativeName = columns[epicColumnIndex + 1] || "";
    }
    if (!voterName && epicMatch?.index !== undefined) {
      const beforeEpic = trimmed
        .slice(0, epicMatch.index)
        .replace(/^\s*\d{1,6}(?:\s+|[|,;])/, "")
        .trim();
      const afterEpic = trimmed
        .slice(epicMatch.index + epicMatch[0].length)
        .trim();
      const beforeColumns = beforeEpic
        .split(/\t+|\s{2,}/)
        .map((value) => value.trim())
        .filter(Boolean);
      const afterColumns = afterEpic
        .split(/\t+|\s{2,}/)
        .map((value) => value.trim())
        .filter(Boolean);
      voterName = beforeColumns[beforeColumns.length - 1] || beforeEpic;
      relativeName = afterColumns[0] || "";
    }
    voterName = voterName.replace(/^\s*\d{1,6}\s+/, "").trim();
    relativeName = relativeName
      .replace(
        /^(?:father|husband|mother|guardian|relative)\s*(?:name)?\s*[:\-]?\s*/i,
        "",
      )
      .trim();
    const hasRecordSignal = Boolean(
      epicMatch ||
      serial ||
      headers?.some((header) =>
        /\b(?:voter|elector|name|epic)\b/i.test(header),
      ) ||
      /\b(?:father|husband|mother|guardian|age|gender|house)\b/i.test(trimmed),
    );
    if (
      !hasRecordSignal ||
      !isLikelyName(voterName) ||
      /^(?:name|epic|age|gender|sex|details?)$/i.test(voterName)
    )
      return [];

    const partNumber =
      columnValue(columns, headers, /\b(?:part|polling\s+part|bhag)\b/i) ||
      trimmed.match(
        /\b(?:part|polling\s+part|bhag)\s*(?:no\.?|number)?\s*[:\-]?\s*(\d{1,4})\b/i,
      )?.[1] ||
      columns.find((column) => /^\d{2,4}$/.test(column)) ||
      pagePart;
    const ageText =
      columnValue(columns, headers, /\b(?:age|years?)\b/i) ||
      trimmed.match(/\b(?:age|years?|umr|vay)\s*[:\-]?\s*(\d{1,3})\b/i)?.[1] ||
      null;
    const ageNumber = ageText ? Number(ageText.replace(/\D/g, "")) : null;
    const genderText =
      columnValue(columns, headers, /\b(?:gender|sex)\b/i) ||
      trimmed.match(
        /\b(?:male|female|other|transgender|पुरुष|महिला|m|f)\b/i,
      )?.[0] ||
      null;
    const gender = genderText
      ? /^(?:m|male|पुरुष)$/i.test(genderText)
        ? "Male"
        : /^(?:f|female|महिला)$/i.test(genderText)
          ? "Female"
          : "Other"
      : null;
    const houseNumber =
      columnValue(columns, headers, /\b(?:house|door|h\.?\s*no|address)\b/i) ||
      trimmed.match(
        /\b(?:house|door|h\.?\s*no)\s*(?:number|no\.?)?\s*[:\-]?\s*([A-Za-z0-9/-]+)\b/i,
      )?.[1] ||
      null;
    const relativeLabel = /\bhusband/i.test(trimmed)
      ? "Husband's Name"
      : /\b(?:mother|guardian)\b/i.test(trimmed)
        ? "Guardian's Name"
        : "Father's Name";
    const confidence = confidenceForRecord({
      relativeName,
      epicNumber: epic,
      serialNumber: serial,
      houseNumber,
      age: ageNumber && ageNumber >= 0 && ageNumber <= 130 ? ageNumber : null,
      gender,
    });
    const stableKey = clean(
      epic || `${pageNumber}-${serial || index}-${voterName}`,
    );

    return [
      {
        id: `${pdfId}-${stableKey}`,
        voterName,
        relativeName,
        relativeLabel,
        epicNumber: epic,
        serialNumber: serial,
        houseNumber,
        age: ageNumber && ageNumber >= 0 && ageNumber <= 130 ? ageNumber : null,
        gender,
        partNumber,
        pageNumber,
        pdfName,
        pdfId,
        confidence,
      },
    ];
  });
}

async function extractPdfPages(
  filePath: string,
  onPage: (page: ExtractedPage) => Promise<void>,
) {
  let textExtractionUnavailable = false;
  try {
    const extracted = await execFileAsync("pdftotext", [
      "-layout",
      filePath,
      "-",
    ]);
    if (extracted.stdout.trim()) {
      const pages = extracted.stdout
        .split("\f")
        .map((text, index) => ({ pageNumber: index + 1, text, usedOcr: false }))
        .filter((page) => page.text.trim());
      for (const page of pages) await onPage(page);
      return { totalPages: pages.length, ocrPages: 0 };
    }
  } catch (error) {
    textExtractionUnavailable =
      error instanceof Error && "code" in error && error.code === "ENOENT";
    // OCR is the fallback for image-only or malformed text layers.
  }
  if (textExtractionUnavailable) {
    throw new Error(
      "PDF text extraction tools are unavailable; install pdftotext or upload text-indexed PDFs.",
    );
  }
  const pageInfo = await execFileAsync("pdfinfo", [filePath]).catch(() => ({
    stdout: "Pages: 1",
  }));
  const pages = Number(pageInfo.stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 1);
  const workDir = await fs.mkdtemp(path.join(tmpdir(), "roll-ocr-"));
  let ocrPages = 0;
  try {
    for (let page = 1; page <= pages; page += 1) {
      const outputBase = path.join(workDir, `page-${page}`);
      await execFileAsync("pdftoppm", [
        "-r",
        "90",
        "-f",
        String(page),
        "-l",
        String(page),
        "-png",
        "-singlefile",
        filePath,
        outputBase,
      ]);
      const ocrOptions = { env: { ...process.env, OMP_THREAD_LIMIT: "1" } };
      const ocr = await execFileAsync(
        "tesseract",
        [`${outputBase}.png`, "stdout", "--psm", "6", "-l", "eng"],
        ocrOptions,
      );
      const epicText = /\bname\s*:/i.test(ocr.stdout)
        ? (
            await execFileAsync(
              "tesseract",
              [`${outputBase}.png`, "stdout", "--psm", "11", "-l", "eng"],
              ocrOptions,
            )
          ).stdout
        : "";
      await onPage({
        pageNumber: page,
        text: ocr.stdout,
        epicText,
        usedOcr: true,
      });
      ocrPages += 1;
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
  return { totalPages: pages, ocrPages };
}

async function writeJson(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, JSON.stringify(value, null, 2));
  await fs.rename(temporaryPath, filePath);
}

async function getPageCount(filePath: string) {
  const info = await execFileAsync("pdfinfo", [filePath]);
  return Number(info.stdout.match(/^Pages:\s+(\d+)/m)?.[1] || 1);
}

export async function ensureStorage() {
  if (initialized) return;
  await fs.mkdir(pdfDirectory, { recursive: true });
  let indexWasMissing = false;
  try {
    const saved = JSON.parse(
      await fs.readFile(indexPath, "utf8"),
    ) as RollRecord[];
    if (Array.isArray(saved)) records = saved;
    villageAssignments = JSON.parse(
      await fs.readFile(villagePath, "utf8"),
    ) as Record<string, string>;
    const savedState = JSON.parse(
      await fs.readFile(statePath, "utf8"),
    ) as Partial<IndexState>;
    if (savedState) state = { ...state, ...savedState };
  } catch {
    indexWasMissing = true;
    try {
      villageAssignments = JSON.parse(
        await fs.readFile(villagePath, "utf8"),
      ) as Record<string, string>;
    } catch {
      villageAssignments = {};
    }
    records = records.map((record) => ({
      ...record,
      villageId: record.villageId ?? villageForPdf(record.pdfId),
    }));
    await writeJson(indexPath, records);
    await writeJson(villagePath, villageAssignments);
    await writeJson(statePath, state);
  }
  initialized = true;
  const files = (await fs.readdir(pdfDirectory)).filter((file) =>
    file.toLowerCase().endsWith(".pdf"),
  );
  const fileIds = new Set(files.map((file) => path.basename(file, ".pdf")));
  const indexedIds = new Set(records.map((record) => record.pdfId));
  const indexIsStale =
    indexWasMissing ||
    state.indexVersion < INDEX_FORMAT_VERSION ||
    state.status === "indexing" ||
    fileIds.size !== indexedIds.size ||
    [...fileIds].some((id) => !indexedIds.has(id));
  if (indexIsStale) {
    if (state.indexVersion < INDEX_FORMAT_VERSION) {
      records = [];
      await writeJson(indexPath, records);
    }
    state = { ...state, status: "ready" };
    void rebuildIndex();
  }
}

export function getIndexState() {
  return state;
}

export function getRecords() {
  return records;
}

export async function listPdfs(query = "") {
  await ensureStorage();
  const files = await fs.readdir(pdfDirectory);
  const indexedByPdf = new Map<string, number>();
  for (const record of records)
    indexedByPdf.set(record.pdfId, (indexedByPdf.get(record.pdfId) ?? 0) + 1);
  const normalizedQuery = clean(query);
  return Promise.all(
    files
      .filter((file) => file.toLowerCase().endsWith(".pdf"))
      .map(async (file) => {
        const stats = await fs.stat(path.join(pdfDirectory, file));
        const id = path.basename(file, ".pdf");
        let pageCount = 1;
        try {
          pageCount = await getPageCount(path.join(pdfDirectory, file));
        } catch {
          pageCount = records
            .filter((record) => record.pdfId === id)
            .reduce((max, record) => Math.max(max, record.pageNumber), 1);
        }
        let displayName = file;
        try {
          displayName =
            (
              await fs.readFile(path.join(pdfDirectory, `${id}.label`), "utf8")
            ).trim() || file;
        } catch {
          // The PDF filename is the display name when no rename label exists.
        }
        return {
          id,
          name: displayName,
          villageId: villageForPdf(id),
          villageName:
            VILLAGES.find((village) => village.id === villageForPdf(id))
              ?.name ?? "Unknown",
          villageNameMr:
            VILLAGES.find((village) => village.id === villageForPdf(id))
              ?.nameMr ?? "",
          sizeBytes: stats.size,
          pageCount: Math.max(1, pageCount),
          uploadedAt: stats.birthtime.toISOString(),
          status: state.status === "indexing" ? "indexing" : "indexed",
          indexedRecords: indexedByPdf.get(id) ?? 0,
          fileUrl: `/api/files/${encodeURIComponent(id)}`,
        };
      }),
  ).then((items) =>
    normalizedQuery
      ? items.filter((item) => clean(item.name).includes(normalizedQuery))
      : items,
  );
}

export async function searchIndex(
  query: string,
  page: number,
  pageSize: number,
  villageId = DEFAULT_VILLAGE_ID,
) {
  await ensureStorage();
  const filters = parseSearchQuery(query);
  const scopedRecords =
    villageId === "all"
      ? records
      : records.filter((record) => villageForPdf(record.pdfId) === villageId);
  const scored = scopedRecords
    .map((record) => {
      const nameScore = filters.name
        ? wordScore(filters.name, record.voterName)
        : 0;
      const relativeScore = filters.relativeName
        ? wordScore(filters.relativeName, record.relativeName)
        : 0;
      const epicScore = filters.epicNumber
        ? clean(record.epicNumber ?? "").includes(clean(filters.epicNumber))
          ? 1
          : 0
        : 0;
      const score = filters.epicNumber
        ? epicScore
        : filters.name && filters.relativeName
          ? nameScore * 0.65 + relativeScore * 0.35
          : Math.max(nameScore, relativeScore);
      return {
        ...record,
        score: Number(score.toFixed(3)),
        matchedBy: [
          nameScore > 0.62 ? "name" : "",
          relativeScore > 0.62 ? "father" : "",
          epicScore ? "EPIC" : "",
        ].filter(Boolean),
      };
    })
    .filter((record) =>
      !filters.epicNumber
        ? record.score >= (filters.name && filters.relativeName ? 0.48 : 0.45)
        : record.score === 1,
    )
    .sort((a, b) => b.score - a.score);
  const start = (page - 1) * pageSize;
  return {
    results: scored.slice(start, start + pageSize),
    total: scored.length,
    page,
    pageSize,
    query,
    filters,
    indexStatus: state.status,
    indexProgress: state.progress,
  };
}

export async function getSuggestions(query: string) {
  await ensureStorage();
  const normalized = clean(query);
  const values = new Map<
    string,
    { label: string; value: string; kind: string }
  >();
  for (const record of records) {
    if (
      clean(record.voterName).includes(normalized) ||
      clean(record.relativeName).includes(normalized) ||
      clean(record.epicNumber ?? "").includes(normalized)
    ) {
      values.set(record.voterName, {
        label: record.voterName,
        value: record.voterName,
        kind: "Voter name",
      });
      if (record.epicNumber)
        values.set(record.epicNumber, {
          label: record.epicNumber,
          value: record.epicNumber,
          kind: "EPIC number",
        });
    }
  }
  return Array.from(values.values()).slice(0, 6);
}

export async function addPdf(
  id: string,
  fileName: string,
  data: Buffer,
  villageId = DEFAULT_VILLAGE_ID,
) {
  await ensureStorage();
  const safeId = id.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const safeName = fileName.toLowerCase().endsWith(".pdf")
    ? fileName
    : `${fileName}.pdf`;
  const filePath = path.join(pdfDirectory, `${safeId}.pdf`);
  const temporaryPath = `${filePath}.uploading`;
  await fs.writeFile(temporaryPath, data);
  await fs.rename(temporaryPath, filePath);
  await fs.writeFile(path.join(pdfDirectory, `${safeId}.label`), safeName);
  villageAssignments[safeId] = villageId;
  await writeJson(villagePath, villageAssignments);
  void rebuildIndex();
  return (await listPdfs()).find((pdf) => pdf.id === safeId);
}

export async function renamePdf(id: string, name: string) {
  await ensureStorage();
  const safeName = path.basename(name).toLowerCase().endsWith(".pdf")
    ? path.basename(name)
    : `${path.basename(name)}.pdf`;
  const current = await listPdfs();
  const item = current.find((pdf) => pdf.id === id);
  if (item) {
    item.name = safeName;
    await fs.writeFile(path.join(pdfDirectory, `${id}.label`), safeName);
    records = records.map((record) =>
      record.pdfId === id ? { ...record, pdfName: safeName } : record,
    );
    await writeJson(indexPath, records);
  }
  void rebuildIndex();
  return item;
}

export async function removePdf(id: string) {
  await ensureStorage();
  await fs.rm(path.join(pdfDirectory, `${id}.pdf`), { force: true });
  await fs.rm(path.join(pdfDirectory, `${id}.label`), { force: true });
  records = records.filter((record) => record.pdfId !== id);
  await writeJson(indexPath, records);
  void rebuildIndex();
}

export async function rebuildIndex() {
  if (state.status === "indexing") {
    rebuildRequested = true;
    return;
  }
  const files = (await fs.readdir(pdfDirectory)).filter((file) =>
    file.toLowerCase().endsWith(".pdf"),
  );
  let indexedPdfs = 0;
  let failedPdfs = 0;
  let ocrPages = 0;
  const warnings: string[] = [];
  state = {
    ...state,
    totalPdfs: files.length,
    totalRecords: records.length,
    status: "indexing",
    progress: 5,
    indexedPdfs,
    failedPdfs,
    warnings,
  };
  await writeJson(statePath, state);
  try {
    const pageCounts = await Promise.all(
      files.map((file) =>
        getPageCount(path.join(pdfDirectory, file)).catch(() => 1),
      ),
    );
    const totalPages = Math.max(
      1,
      pageCounts.reduce((sum, count) => sum + count, 0),
    );
    let processedPages = 0;
    let persistence = Promise.resolve();
    const persist = (includeIndex: boolean) => {
      const recordsSnapshot = records;
      const stateSnapshot = state;
      persistence = persistence.then(async () => {
        if (includeIndex) await writeJson(indexPath, recordsSnapshot);
        await writeJson(statePath, stateSnapshot);
      });
      return persistence;
    };
    const indexFile = async (file: string, fileIndex: number) => {
      const id = path.basename(file, ".pdf");
      let parsedForPdf: RollRecord[] = [];
      let replacedExistingRecords = false;
      try {
        await extractPdfPages(path.join(pdfDirectory, file), async (page) => {
          if (page.usedOcr) ocrPages += 1;
          const parsed = parseTextRecords(
            page.text,
            file,
            id,
            page.pageNumber,
            page.epicText,
          );
          parsedForPdf = [...parsedForPdf, ...parsed];
          const unique = Array.from(
            new Map(parsedForPdf.map((record) => [record.id, record])).values(),
          );
          if (unique.length > 0 && !replacedExistingRecords) {
            records = records.filter((record) => record.pdfId !== id);
            replacedExistingRecords = true;
          }
          if (replacedExistingRecords) {
            records = [
              ...records.filter((record) => record.pdfId !== id),
              ...unique,
            ];
          }
          processedPages += 1;
          state = {
            ...state,
            totalRecords: records.length,
            progress: Math.min(
              95,
              Math.round((processedPages / totalPages) * 90) + 5,
            ),
            ocrPages,
          };
          await persist(replacedExistingRecords);
        });
        if (parsedForPdf.length === 0)
          warnings.push(`${file}: no voter records could be recognized`);
        indexedPdfs += 1;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "indexing failed";
        const extractionToolsMissing =
          message.includes("PDF text extraction tools are unavailable") ||
          /spawn (?:pdftoppm|tesseract) ENOENT/i.test(message);
        if (extractionToolsMissing) {
          indexedPdfs += 1;
          warnings.push(
            `${file}: PDF extraction tools are unavailable. Existing indexed records were preserved.`,
          );
        } else {
          failedPdfs += 1;
          warnings.push(`${file}: ${message}`);
        }
      }
      state = {
        ...state,
        totalRecords: records.length,
        progress: Math.max(
          state.progress,
          Math.round(((fileIndex + 1) / Math.max(files.length, 1)) * 90) + 5,
        ),
        indexedPdfs,
        failedPdfs,
        ocrPages,
        warnings,
      };
      await persist(replacedExistingRecords);
    };
    await Promise.all(files.map((file, index) => indexFile(file, index)));
    await persistence;
    state = {
      ...state,
      totalPdfs: files.length,
      totalRecords: records.length,
      status: failedPdfs > 0 ? "error" : "ready",
      lastIndexedAt: new Date().toISOString(),
      indexVersion: INDEX_FORMAT_VERSION,
      progress: 100,
      indexedPdfs,
      failedPdfs,
      ocrPages,
      recordsWithEpic: records.filter((record) => Boolean(record.epicNumber))
        .length,
      recordsWithRelativeName: records.filter((record) =>
        Boolean(record.relativeName),
      ).length,
      recordsWithDetails: records.filter((record) =>
        Boolean(record.houseNumber || record.age !== null || record.gender),
      ).length,
      warnings,
    };
    await writeJson(indexPath, records);
    await writeJson(statePath, state);
  } catch {
    state = { ...state, status: "error", progress: 0 };
    await writeJson(statePath, state);
  }
  if (rebuildRequested) {
    rebuildRequested = false;
    void rebuildIndex();
  }
}
