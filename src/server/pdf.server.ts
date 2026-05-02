// PDF text extraction. Server-only. Uses pdf-parse with a Node Buffer.
import pdfParse from "pdf-parse";

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  // pdf-parse expects a Node Buffer
  const buffer = Buffer.from(bytes);
  const result = await pdfParse(buffer);
  return result.text ?? "";
}
