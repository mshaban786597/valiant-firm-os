import { cookies } from "next/headers";

/**
 * Data scope: "live" (real operations) or "demo" (labeled fixtures such as the
 * pilots). Every operational query filters by `isDemo` so demo records never
 * enter live KPI totals, exports or notifications, and are still fully visible
 * when the operator switches to the demo scope.
 */
export type DataEnv = "live" | "demo";

export const SCOPE_COOKIE = "vf_scope";

export interface DataScope {
  env: DataEnv;
  isDemo: boolean;
  label: string;
}

export function scopeFromValue(value: string | null | undefined): DataScope {
  const env: DataEnv = value === "demo" ? "demo" : "live";
  return { env, isDemo: env === "demo", label: env === "demo" ? "Demo data" : "Live data" };
}

/** Server-side: the scope selected in the top bar (defaults to live). */
export function getDataScope(): DataScope {
  try {
    return scopeFromValue(cookies().get(SCOPE_COOKIE)?.value);
  } catch {
    return scopeFromValue(null); // outside a request (scripts, tests)
  }
}
