export function authSecret() {
  return (
    process.env.NEXTAUTH_SECRET ??
    (process.env.NODE_ENV !== "production"
      ? "dev-valiant-insecure-secret-change-me"
      : "")
  );
}
