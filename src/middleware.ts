import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { authSecret } from "@/lib/auth-secret";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leads",
  "/outreach",
  "/pipeline",
  "/clients",
  "/delivery",
  "/content",
  "/reports",
  "/health",
  "/automations",
  "/ai-logs",
  "/rank-rent",
  "/saas-roadmap",
  "/settings",
];

export async function middleware(req: NextRequest) {
  const secret = authSecret();
  const token =
    secret &&
    (await getToken({
      req,
      secret,
    }));

  const path = req.nextUrl.pathname;

  if (path.startsWith("/login")) {
    if (token) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
    return NextResponse.next();
  }

  const isProtected =
    path === "/" || PROTECTED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));

  if (isProtected && !token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("callbackUrl", path === "/" ? "/dashboard" : path);
    return NextResponse.redirect(loginUrl);
  }

  if (path === "/" && token) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
