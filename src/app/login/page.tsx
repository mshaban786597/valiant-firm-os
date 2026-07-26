import { Suspense } from "react";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background px-4 text-sm text-muted">
          Loading login…
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
