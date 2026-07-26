"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";

export function AiLogDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-500/40 px-2 py-1 text-[11px] font-semibold text-red-100"
      >
        Delete
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete AI log entry?"
        confirmLabel="Delete"
        onConfirm={async () => {
          const res = await fetch(`/api/ai-logs/${id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!res.ok) {
            toast.error(await errorMessageFromResponse(res));
            throw new Error("failed");
          }
          toast.success("Log entry removed.");
          router.refresh();
        }}
      />
    </>
  );
}
