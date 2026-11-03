"use client";

import { useRef, useState } from "react";
import { Confirmation, PendingButton } from "@/components/ui/confirmation";

export function ConfirmedAction({ action, fields, label, summary }: {
  action: (data: FormData) => Promise<void>; fields: Record<string, string>; label: string; summary: string;
}) {
  const form = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [open, setOpen] = useState(false);
  return <form ref={form} action={action} onSubmit={(event) => {
    if (!confirmed.current) { event.preventDefault(); setOpen(true); }
    confirmed.current = false;
  }}>
    {Object.entries(fields).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)}
    <PendingButton busy="Updating…">{label}</PendingButton>
    <Confirmation open={open} title={label} onCancel={() => setOpen(false)} onConfirm={() => {
      setOpen(false); confirmed.current = true; form.current?.requestSubmit();
    }}>{summary}</Confirmation>
  </form>;
}
