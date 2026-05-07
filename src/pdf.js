// src/pdf.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DOCS_FOLDER = path.join(__dirname, "../docs");

/**
 * Lee todos los PDFs de la carpeta /docs y retorna su contenido como texto
 */
export async function readAllPDFs() {
  const results = [];

  // Usar createRequire para evitar el bug de ESM en pdf-parse@1.1.1
  // que intenta leer un archivo de test al importarse dinámicamente
  const pdfParse = require("pdf-parse");

  if (!fs.existsSync(DOCS_FOLDER)) {
    fs.mkdirSync(DOCS_FOLDER, { recursive: true });
    return results;
  }

  const files = fs.readdirSync(DOCS_FOLDER).filter(f => f.toLowerCase().endsWith(".pdf"));

  for (const file of files) {
    try {
      const filePath = path.join(DOCS_FOLDER, file);
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      const stats = fs.statSync(filePath);

      results.push({
        nombre: file,
        texto: data.text.slice(0, 2000), // 2000 chars por PDF — optimizado para Groq free tier (12K TPM)
        paginas: data.numpages,
        subido: stats.mtime.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
      });

      console.log(`[PDF] Leido: ${file} (${data.numpages} pag.)`);
    } catch (err) {
      console.error(`[PDF] Error leyendo ${file}:`, err.message);
    }
  }

  return results;
}

/**
 * Lista los archivos en /docs con metadata
 */
export function listDocs() {
  if (!fs.existsSync(DOCS_FOLDER)) return [];
  return fs.readdirSync(DOCS_FOLDER)
    .filter(f => f.toLowerCase().endsWith(".pdf"))
    .map(f => {
      const stats = fs.statSync(path.join(DOCS_FOLDER, f));
      return {
        nombre: f,
        tamanio: (stats.size / 1024).toFixed(1) + " KB",
        subido: stats.mtime.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })
      };
    });
}
