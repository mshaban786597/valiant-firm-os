/**
 * Data scope. The app shows live operations only: there is no second scope to
 * switch to. Rows flagged in the database as fixtures (the `isDemo` column,
 * left over from the early pilots) are filtered out of every page, total,
 * export and notification by the queries that use this.
 */
export interface DataScope {
  env: "live";
  isDemo: boolean;
  label: string;
}

const LIVE: DataScope = { env: "live", isDemo: false, label: "Live data" };

/** The scope every page and API route reads. Always live. */
export function getDataScope(): DataScope {
  return LIVE;
}
