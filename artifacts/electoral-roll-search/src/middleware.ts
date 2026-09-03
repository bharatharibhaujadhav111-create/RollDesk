import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function unauthorized(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Admin authentication required" },
      { status: 401 },
    );
  }
  return new NextResponse("Admin authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Roll Desk Admin"' },
  });
}

export function middleware(request: NextRequest) {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return process.env.NODE_ENV === "production"
      ? NextResponse.json(
          { error: "Admin authentication is not configured" },
          { status: 503 },
        )
      : NextResponse.next();
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return unauthorized(request);

  let credentials: string;
  try {
    credentials = atob(authorization.slice(6));
  } catch {
    return unauthorized(request);
  }
  const separator = credentials.indexOf(":");
  const username = separator >= 0 ? credentials.slice(0, separator) : "";
  const suppliedPassword =
    separator >= 0 ? credentials.slice(separator + 1) : "";
  if (
    username !== (process.env.ADMIN_USER || "admin") ||
    suppliedPassword !== password
  ) {
    return unauthorized(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
