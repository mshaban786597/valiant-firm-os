"use client";

import { ClientStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast-provider";
import { errorMessageFromResponse } from "@/lib/api-error";
import { money } from "@/lib/money";
import type { ClientFormValues } from "@/components/clients/client-form-modal";
import { ClientFormModal } from "@/components/clients/client-form-modal";

export function ClientDetailCrud({
  client,
}: {
  client: {
    id: string;
    businessName: string;
    primaryContact: string | null;
    email: string | null;
    phone: string | null;
    websiteUrl: string | null;
    servicePurchased: string | null;
    monthlyValue: unknown;
    contractStart: Date | string | null;
    status: ClientStatus;
    healthScore: number | null;
    assignedSeoLead: string | null;
    targetLocations: string[];
    targetServices: string[];
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const contractStr = useMemo(() => {
    if (!client.contractStart) return "";
    const d = new Date(client.contractStart);
    return d.toISOString().slice(0, 10);
  }, [client.contractStart]);

  const initial: Partial<ClientFormValues> = {
    businessName: client.businessName,
    primaryContact: client.primaryContact ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    websiteUrl: client.websiteUrl ?? "",
    servicePurchased: client.servicePurchased ?? "",
    monthlyValue:
      client.monthlyValue == null ? "" : String(money(client.monthlyValue)),
    contractStart: contractStr,
    status: client.status,
    healthScore: client.healthScore == null ? "" : String(client.healthScore),
    assignedSeoLead: client.assignedSeoLead ?? "",
    targetLocations: (client.targetLocations ?? []).join(", "),
    targetServices: (client.targetServices ?? []).join(", "),
  };

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        className="rounded-lg border border-card-border bg-card px-3 py-2 text-xs font-semibold"
      >
        Edit client
      </button>
      <button
        type="button"
        onClick={() => setDelOpen(true)}
        className="rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-100"
      >
        Delete client
      </button>
      <ClientFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        clientId={client.id}
        initial={initial}
      />
      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        title="Delete this client?"
        description="Permanently removes the client, onboarding items, tasks, and related delivery records per database cascade rules."
        confirmLabel="Delete"
        onConfirm={async () => {
          const res = await fetch(`/api/clients/${client.id}`, {
            method: "DELETE",
            credentials: "include",
          });
          if (!res.ok) {
            toast.error(await errorMessageFromResponse(res));
            throw new Error("delete failed");
          }
          toast.success("Client deleted.");
          router.push("/clients");
          router.refresh();
        }}
      />
    </div>
  );
}
