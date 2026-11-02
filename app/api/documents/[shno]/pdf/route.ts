import { getDocument } from "@/lib/docflow/documents";
import { buildDocumentPdfModel, renderDocumentPdf } from "@/lib/pdf/document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shno: string }> },
) {
  try {
    const { shno } = await params;
    const document = await getDocument(shno);
    if (!document) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    // Amounts come from the database record, never from the request.
    const bytes = await renderDocumentPdf(buildDocumentPdfModel(document));

    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${document.documentNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Document PDF generation failed", error);
    const unsupported = error instanceof Error && error.message.includes("cannot encode");
    return Response.json(
      { error: unsupported
        ? "This PDF contains characters the export font cannot display. Your document is unchanged. Please contact support."
        : "PDF download failed. Please try again. Your document is unchanged." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
