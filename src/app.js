// src/app.js
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import fs from "fs";
import cron from "node-cron";
import { getBoardData } from "./trello.js";
import { analyze, chat, analyzeForReport } from "./ai.js";
import { readAllPDFs, listDocs, DOCS_FOLDER } from "./pdf.js";
import { sendProgressReport, sendAlertEmail } from "./mailer.js";
import { generateReportPDF } from "./reportPDF.js";
import {
  loadStore, saveAnalysis, saveBoardSnapshot, detectChanges,
  saveStatsSnapshot, logEmail, markAlertSent, wasAlertSentToday,
  getHistorySummary
} from "./store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

// ── STORE (persistencia) ──────────────────────────────────────────
const store = loadStore();
console.log(`[Store] Cargado — ${store.analysisHistory.length} análisis previos, ${store.emailLog.length} correos enviados`);

// Multer: guardar PDFs en /docs
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, DOCS_FOLDER),
  filename: (req, file, cb) => cb(null, Date.now() + "_" + file.originalname)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Solo se permiten archivos PDF"));
  },
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB max
});

let cachedBoardData = null;
let lastAnalysis = null;
let lastAnalysisTime = null;
let boardContext = "";
let cachedStats = {};
let cachedPdfContext = "";  // contenido de los PDFs para el chat

// Restaurar último análisis del store si existe
if (store.analysisHistory.length > 0) {
  const ultimo = store.analysisHistory[store.analysisHistory.length - 1];
  lastAnalysis = ultimo.analysis;
  lastAnalysisTime = new Date(ultimo.fecha).toLocaleString("es-ES");
  cachedStats = ultimo.stats || {};
  console.log(`[Store] Restaurado último análisis del ${lastAnalysisTime}`);
}

function buildBoardContext(cards, lists) {
  const listMap = {};
  lists.forEach(l => { listMap[l.id] = l.name; });
  const ahora = new Date();

  const atrasadas = cards.filter(c => c.fecha && new Date(c.fecha) < ahora && !c.completada);
  const sinAsignar = cards.filter(c => !c.miembros || c.miembros.length === 0);
  const completadas = cards.filter(c => c.completada);
  const fases = [...new Set(cards.map(c => listMap[c.estado]))].join(" -> ");

  // Calcular dias de atraso para cada tarea vencida
  const atrasadasTexto = atrasadas.length > 0
    ? atrasadas.map(t => {
        const vencio = new Date(t.fecha);
        const diasAtraso = Math.floor((ahora - vencio) / (1000 * 60 * 60 * 24));
        const fechaVenc = vencio.toLocaleDateString("es-ES", { day:"2-digit", month:"short", year:"numeric" });
        const fechaHoy = ahora.toLocaleDateString("es-ES", { day:"2-digit", month:"short", year:"numeric" });
        return `- "${t.nombre}" | venció: ${fechaVenc} → hoy: ${fechaHoy} | LLEVA ${diasAtraso} dias de atraso | fase: ${listMap[t.estado]}`;
      }).join("\n")
    : "Ninguna tarea atrasada";

  const tareasTexto = cards.map(t =>
    `- [${t.completada ? "COMPLETA" : "EN CURSO"}] "${t.nombre}" | ${listMap[t.estado]} | vence: ${t.fecha ? new Date(t.fecha).toLocaleDateString("es-ES") : "sin fecha"} | responsables: ${t.miembros?.length || 0}`
  ).join("\n");

  return `FASES: ${fases}
TOTAL: ${cards.length} | COMPLETADAS: ${completadas.length} | EN CURSO: ${cards.length - completadas.length}
ATRASADAS: ${atrasadas.length} | SIN ASIGNAR: ${sinAsignar.length}

TAREAS ATRASADAS (con rango de fechas):
${atrasadasTexto}

TODAS LAS TAREAS:
${tareasTexto}`;
}

async function runAnalysis() {
  console.log("[Agente] Obteniendo datos del tablero...");
  const { cards, lists } = await getBoardData();
  if (!cards.length) return null;
  cachedBoardData = { cards, lists };
  boardContext = buildBoardContext(cards, lists);
  const ahora = new Date();
  const atrasadas = cards.filter(c => c.fecha && new Date(c.fecha) < ahora && !c.completada);
  const sinAsignar = cards.filter(c => !c.miembros || c.miembros.length === 0);
  const completadas = cards.filter(c => c.completada);

  // Detectar cambios desde el último snapshot
  const changes = detectChanges(store, cards);
  if (changes) {
    console.log("[Agente] Cambios detectados:", JSON.stringify({
      nuevas: changes.nuevasTareas.length,
      completadas: changes.tareasCompletadas.length,
      movidas: changes.tareasMovidas.length,
      nuevasAtrasadas: changes.nuevasAtrasadas.length
    }));
  }

  // Guardar snapshot actual
  saveBoardSnapshot(store, cards);

  // Leer PDFs si los hay
  const pdfs = await readAllPDFs();
  cachedPdfContext = "";
  if (pdfs.length > 0) {
    cachedPdfContext = "DOCUMENTOS PDF DEL PROYECTO (" + pdfs.length + " archivos):\n" +
      pdfs.map(p => `--- ${p.nombre} (subido: ${p.subido}) ---\n${p.texto}`).join("\n\n");
    console.log(`[Agente] ${pdfs.length} PDFs cargados al contexto.`);
  }

  // Incluir historial de análisis previos para contexto de evolución
  const historySummary = getHistorySummary(store);
  const pdfCtxConHistorial = cachedPdfContext + (historySummary ? "\n\n" + historySummary : "");
  
  // Limitar contexto para evitar Rate Limit (6K TPM en modelo 8B instant)
  const pdfContextLimitado = pdfCtxConHistorial.slice(0, 2000);

  console.log("[Agente] Analizando con IA...");
  let result = null;
  try {
    result = await analyze(cards, lists, atrasadas, sinAsignar, pdfContextLimitado);
    if (result === "Error al contactar la IA.") throw new Error("Groq falló internamente");
  } catch (e) {
    console.error("[Agente] Error en analisis IA:", e.message);
    result = lastAnalysis || "Análisis no disponible temporalmente por límites de la API.";
  }
  
  lastAnalysis = result;
  lastAnalysisTime = new Date().toLocaleString("es-ES");
  console.log("[Agente] Analisis completo.");

  // Guardar stats para el correo
  cachedStats = {
    total: cards.length,
    completadas: completadas.length,
    atrasadas: atrasadas.length,
    pct: cards.length ? Math.round(completadas.length / cards.length * 100) : 0
  };

  // ── PERSISTIR ────────────────────────────────────────────────
  saveAnalysis(store, lastAnalysis, cachedStats);
  saveStatsSnapshot(store, cachedStats);

  // ── ALERTAS PROACTIVAS ───────────────────────────────────────
  // Si hay tareas NUEVAMENTE atrasadas, enviar alerta por correo
  if (changes && changes.nuevasAtrasadas.length > 0) {
    const nuevasNoAlertadas = changes.nuevasAtrasadas.filter(
      nombre => {
        const card = cards.find(c => c.nombre === nombre);
        return card && !wasAlertSentToday(store, card.id);
      }
    );
    if (nuevasNoAlertadas.length > 0) {
      console.log(`[Alerta] ${nuevasNoAlertadas.length} tarea(s) recién atrasada(s) → enviando alerta...`);
      try {
        const alertResult = await sendAlertEmail(nuevasNoAlertadas, cards);
        if (alertResult.ok) {
          nuevasNoAlertadas.forEach(nombre => {
            const card = cards.find(c => c.nombre === nombre);
            if (card) markAlertSent(store, card.id);
          });
          logEmail(store, { ...alertResult, type: "alerta" });
          console.log(`[Alerta] Alerta enviada a ${alertResult.recipients?.join(", ")}`);
        }
      } catch (e) {
        console.error("[Alerta] Error enviando alerta:", e.message);
      }
    }
  }

  return result;
}

app.get("/api/analysis", async (req, res) => {
  try {
    if (!lastAnalysis) await runAnalysis();
    res.json({ analysis: lastAnalysis, time: lastAnalysisTime });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/analysis/refresh", async (req, res) => {
  try {
    const result = await runAnalysis();
    res.json({ analysis: result, time: lastAnalysisTime });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: "Mensaje requerido" });

    const tablero = boardContext || (cachedBoardData ? buildBoardContext(cachedBoardData.cards, cachedBoardData.lists) : "Sin datos del tablero.");

    // Si no tenemos PDFs cacheados aún, los cargamos ahora
    if (!cachedPdfContext) {
      const pdfs = await readAllPDFs();
      if (pdfs.length > 0) {
        cachedPdfContext = "DOCUMENTOS PDF DEL PROYECTO (" + pdfs.length + " archivos):\n" +
          pdfs.map(p => `--- ${p.nombre} (subido: ${p.subido}) ---\n${p.texto}`).join("\n\n");
      }
    }

    // Contexto completo = tablero + PDFs (optimizado para Groq 8B: 6K TPM)
    const ctxCompleto = tablero.slice(0, 1500) +
      (cachedPdfContext ? "\n\n" + cachedPdfContext.slice(0, 1500) : "");

    const reply = await chat(message, ctxCompleto, history);
    res.json({ reply });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get("/api/board", async (req, res) => {
  try {
    if (!cachedBoardData) cachedBoardData = await getBoardData();
    res.json(cachedBoardData);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RUTAS PDF ──────────────────────────────────────────────────────────────

// Listar PDFs subidos
app.get("/api/docs", (req, res) => {
  res.json(listDocs());
});

// Subir un PDF
app.post("/api/docs/upload", upload.single("pdf"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No se recibió archivo PDF" });
  res.json({ ok: true, nombre: req.file.filename, tamanio: (req.file.size / 1024).toFixed(1) + " KB" });
});

// Eliminar un PDF
app.delete("/api/docs/:nombre", (req, res) => {
  const filePath = path.join(DOCS_FOLDER, req.params.nombre);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: "Archivo no encontrado" });
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

// ── RUTAS CORREO ───────────────────────────────────────────────────────────

// Enviar reporte manual
app.post("/api/email/send", async (req, res) => {
  try {
    if (!lastAnalysis) await runAnalysis();
    const pdfs = await readAllPDFs();
    const result = await sendProgressReport(lastAnalysis, pdfs, cachedStats);
    logEmail(store, { ...result, type: "reporte_manual" });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Ver configuración de correo (sin mostrar contraseña)
app.get("/api/email/config", async (req, res) => {
  try {
    const { config } = await import("./config.js");
    res.json({
      configured: !!(config.smtpUser && config.teamEmails),
      smtpUser: config.smtpUser || "No configurado",
      teamEmails: config.teamEmails ? config.teamEmails.split(",").length + " destinatario(s)" : "No configurado"
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── RUTA: HISTORIAL DEL AGENTE ─────────────────────────────────────────────
app.get("/api/history", (req, res) => {
  res.json({
    totalAnalisis: store.analysisHistory.length,
    totalCorreos: store.emailLog.length,
    ultimosAnalisis: store.analysisHistory.slice(-5).map(a => ({
      fecha: a.fecha,
      stats: a.stats
    })),
    ultimosCorreos: store.emailLog.slice(-10),
    statsHistory: store.statsHistory.slice(-50),
    lastBoardUpdate: store.lastBoardSnapshot?.fecha || null
  });
});

// ── REPORTE PDF ────────────────────────────────────────────────────────────
app.get("/api/report/pdf", async (req, res) => {
  try {
    console.log("[PDF] Generando reporte fresco...");

    // 1. Obtener datos frescos del tablero siempre
    const { cards, lists } = await getBoardData();
    const ahora = new Date();
    const atrasadas = cards.filter(c => c.fecha && new Date(c.fecha) < ahora && !c.completada);
    const sinAsignar = cards.filter(c => !c.miembros || c.miembros.length === 0);
    const completadas = cards.filter(c => c.completada);

    const stats = {
      total: cards.length,
      completadas: completadas.length,
      atrasadas: atrasadas.length,
      pct: cards.length ? Math.round(completadas.length / cards.length * 100) : 0
    };

    // 2. Leer todos los PDFs frescos
    const pdfs = await readAllPDFs();
    const pdfContext = pdfs.length > 0
      ? pdfs.map(p => `=== ${p.nombre} ===\n${p.texto}`).join("\n\n")
      : "";

    console.log(`[PDF] ${cards.length} tareas, ${pdfs.length} documentos PDF → analizando con IA...`);

    // 3. Generar análisis profundo específico para este reporte (siempre nuevo)
    const analysisForPdf = await analyzeForReport(cards, lists, atrasadas, sinAsignar, pdfContext);

    // Validar respuesta de la IA antes de generar el PDF
    if (!analysisForPdf || analysisForPdf.includes("La IA no respondió") || analysisForPdf.toLowerCase().includes("error")) {
      return res.status(500).json({ error: "No se pudo generar el análisis con IA. Intenta de nuevo más tarde." });
    }

    console.log("[PDF] Análisis listo, generando documento...");

    // 4. Generar el PDF con todo el análisis fresco
    generateReportPDF(res, {
      cards,
      lists,
      analysis: analysisForPdf,
      stats,
      lastAnalysisTime: new Date().toLocaleString("es-ES")
    });

  } catch (e) {
    console.error("[PDF]", e.message);
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});
// ── HEALTH CHECK (para mantener la app viva en Render) ─────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.floor(process.uptime()) + "s",
    lastAnalysis: lastAnalysisTime || "pendiente",
    totalAnalisis: store.analysisHistory.length,
    totalCorreos: store.emailLog.length
  });
});

// ── TRIGGER EXTERNO para el reporte diario (backup si el cron interno no dispara)
app.get("/api/trigger/daily-report", async (req, res) => {
  console.log("[Trigger] Reporte diario disparado externamente...");
  try {
    if (!lastAnalysis) await runAnalysis();
    const pdfs = await readAllPDFs();
    const result = await sendProgressReport(lastAnalysis, pdfs, cachedStats);
    logEmail(store, { ...result, type: "reporte_diario_trigger" });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── INICIO ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\nAgente corriendo en: http://localhost:${PORT}\n`);
  runAnalysis();
});

// Análisis automático cada 30 minutos
cron.schedule("*/30 * * * *", () => {
  console.log("[Cron] Analisis automatico...");
  runAnalysis();
});

// Correo automático diario a las 8:00 AM
cron.schedule("0 8 * * *", async () => {
  console.log("[Cron] Enviando reporte diario por correo...");
  try {
    if (!lastAnalysis) await runAnalysis();
    const pdfs = await readAllPDFs();
    const result = await sendProgressReport(lastAnalysis, pdfs, cachedStats);
    logEmail(store, { ...result, type: "reporte_diario" });
    if (result.ok) console.log(`[Cron] Reporte enviado a ${result.recipients?.join(", ")}`);
    else console.warn("[Cron] No se pudo enviar el correo:", result.reason);
  } catch (e) {
    console.error("[Cron] Error en reporte diario:", e.message);
  }
});