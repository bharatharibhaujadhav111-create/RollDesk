import { handleUpload, type HandleUploadBody } from "@vercel/blob/server";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addPdfFromStream } from "@/server/electoral-roll";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;
const VILLAGE_IDS = new Set([
  "akolekati",
  "banegaon",
  "belati",
  "bhagaiwadi",
  "bhatewadi",
  "bhogaon",
  "darfal-bibi",
  "darphal-gawadi",
  "dongaon",
  "ekrukh",
  "gulwanchi",
  "haglur",
  "hipparge",
  "hiraj",
  "honsal",
  "kalman",
  "karamba",
  "kavathe",
  "khed",
  "kondi",
  "kouthali",
  "mardi",
  "mohitewadi",
  "nandur",
  "nannaj",
  "narotewadi",
  "padsali",
  "pakani",
  "pathari",
  "raleras",
  "ranmasle",
  "sakharewadi",
  "samshapur",
  "sevalalnagar",
  "shivani",
  "taratgaon",
  "telgaon",
  "tirhe",
  "wadala",
  "wangi",
]);

function isAuthorized(request: Request) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password || process.env.NODE_ENV !== "production") return true;
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return false;
  try {
    const credentials = atob(authorization.slice(6));
    const separator = credentials.indexOf(":");
    return (
      credentials.slice(0, separator) === (process.env.ADMIN_USER || "admin") &&
      credentials.slice(separator + 1) === password
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { error: "Admin authentication required" },
      { status: 401 },
    );
  }
  try {
    const json = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body: json,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const [, villageId, filename] = pathname.split("/");
        if (
          !VILLAGE_IDS.has(villageId) ||
          !filename?.toLowerCase().endsWith(".pdf")
        ) {
          throw new Error("A valid village and PDF filename are required");
        }
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: false,
        };
      },
      onUploadCompleted: async ({ blob }) => {
        const [, villageId, encodedName] = blob.pathname.split("/");
        const name = decodeURIComponent(encodedName || "upload.pdf");
        const fileResponse = await fetch(blob.url);
        if (!fileResponse.ok || !fileResponse.body) {
          throw new Error(
            `Could not read completed Blob upload (${fileResponse.status})`,
          );
        }
        await addPdfFromStream(
          `roll-${randomUUID()}`,
          name,
          Readable.fromWeb(
            fileResponse.body as globalThis.ReadableStream<Uint8Array>,
          ),
          villageId,
        );
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Blob upload failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
