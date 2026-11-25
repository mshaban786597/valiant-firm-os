import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { authSecret } from "@/lib/auth-secret";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/leads",
  "/contacts",
  "/outreach",
  "/pipeline",
  "/clients",
  "/sites",
  "/inbox",
  "/campaigns",
  "/ecommerce",
  "/delivery",
  "/content",
  "/reports",
  "/monitoring",
  "/automation-system",
  "/approvals",
  "/integrations",
  "/health",
  "/seo",
  "/analytics",
  "/gbp",
  "/google-ads",
  "/email-campaigns",
  "/billing",
  "/expenses",
  "/automations",
  "/ai-logs",
  "/rank-rent",
  "/saas-roadmap",
  "/search",
  "/activity",
  "/settings",
];

export async function middleware(req: NextRequest) {
  // The image optimizer is not used by this app. Refuse its endpoint outright.
  if (req.nextUrl.pathname.startsWith("/_next/image")) {
    return new NextResponse(null, { status: 404 });
  }

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
    "/_next/image",
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
