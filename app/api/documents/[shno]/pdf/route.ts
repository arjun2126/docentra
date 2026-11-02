import { getDocument } from "@/lib/docflow/documents";
import { buildDocumentPdfModel, renderDocumentPdf } from "@/lib/pdf/document-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shno: string }> },
) {
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
}
