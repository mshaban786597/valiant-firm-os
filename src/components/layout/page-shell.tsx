"use client";

import type { ReactNode } from "react";
import { TopBar } from "@/components/layout/top-bar";

export function PageShell({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <>
      <TopBar title={title} actions={actions} />
      <div className="mx-auto max-w-[1400px] space-y-6 p-4 lg:p-8">{children}</div>
    </>
  );
}
