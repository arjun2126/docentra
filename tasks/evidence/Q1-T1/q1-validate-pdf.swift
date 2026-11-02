import Foundation
import PDFKit
import AppKit

for status in ["draft", "approved"] {
    let base = "/private/var/folders/82/d8xptlz976z981kdf1yg_k3c0000gn/T/opencode/q1-pdf-after-\(status)"
    guard let pdf = PDFDocument(url: URL(fileURLWithPath: base + ".pdf")), let text = pdf.string else { fatalError("Cannot parse PDF") }
    let normalized = text.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    let item = "Crème brûlée — " + String(repeating: "Long catalogue description with specifications ", count: 3) + "FINAL TEXT"
    let itemText = pdf.page(at: 0)!.selection(for: CGRect(x: 76, y: 100, width: 213, height: 600))!.string!.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
    // PDFKit joins some wrapped words without whitespace; compare every nonspace character.
    precondition(itemText.filter { !$0.isWhitespace }.contains(item.filter { !$0.isWhitespace }), "Missing item: \(itemText)")
    for expected in ["Café Müller", "DOC-2026-000013", "2026-11-02", "Status: \(status)", "2.5000", "12.34", "30.85", "Total: 30.85"] {
        precondition(normalized.contains(expected), "Missing \(expected): \(normalized)")
    }
    try text.write(toFile: base + ".txt", atomically: true, encoding: .utf8)
    let image = pdf.page(at: 0)!.thumbnail(of: NSSize(width: 1190, height: 1684), for: .mediaBox)
    let bitmap = NSBitmapImageRep(data: image.tiffRepresentation!)!
    try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: base + "-render.png"))
    print("PDFKit parsed + rendered + verified all fields: \(status), \(pdf.pageCount) page(s)")
}
