"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function DownloadPdf({ shno, documentNumber }: { shno: string; documentNumber: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/documents/${shno}/pdf`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "PDF download failed. Please try again.");
      }
      if (!response.headers.get("Content-Type")?.includes("application/pdf")) {
        throw new Error("PDF download failed. Please try again.");
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${documentNumber}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Keep the URL alive until the browser has consumed the download.
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError)
        ? cause.message
        : "PDF download failed. Please try again. Your document is unchanged.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={pending} onClick={download}>
        {pending ? "Preparing PDF…" : "Download PDF"}
      </Button>
      {error ? <p role="alert" aria-label="PDF download error" className="max-w-sm text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
