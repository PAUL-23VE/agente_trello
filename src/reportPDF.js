// src/reportPDF.js
import PDFDocument from "pdfkit";

/**
 * Genera un PDF de reporte de avance y lo escribe en el response (stream)
 */
export function generateReportPDF(res, { cards, lists, analysis, stats, lastAnalysisTime }) {
  const listMap = {};
  lists.forEach(l => { listMap[l.id] = l.name; });

  const ahora = new Date();
  const fechaStr = ahora.toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  const atrasadas = cards.filter(c => c.fecha && new Date(c.fecha) < ahora && !c.completada);
  const completadas = cards.filter(c => c.completada);
  const enCurso = cards.filter(c => !c.completada);

  // Agrupar tareas por fase
  const porFase = {};
  cards.forEach(c => {
    const fase = listMap[c.estado] || "Sin fase";
    if (!porFase[fase]) porFase[fase] = [];
    porFase[fase].push(c);
  });

  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Reporte_Proformax_${ahora.toISOString().slice(0,10)}.pdf"`);
  doc.pipe(res);

  // ── COLORES ────────────────────────────────────
  const BLUE   = "#1a73e8";
  const DARK   = "#1a1a2e";
  const GRAY   = "#555555";
  const LIGHT_GRAY = "#888888";
  const GREEN  = "#2e7d32";
  const RED    = "#c62828";
  const YELLOW = "#f57f17";
  const WHITE  = "#ffffff";
  const SECTION_BG = "#eef2fb";
  const ORANGE = "#e65100";

  // ── HEADER ─────────────────────────────────────
  doc.rect(0, 0, doc.page.width, 110).fill(DARK);
  doc.fontSize(20).fillColor(WHITE).font("Helvetica-Bold")
    .text("REPORTE DE AVANCE — PROFORMAX", 50, 22, { align: "center" });
  doc.fontSize(11).fillColor("#90caf9").font("Helvetica")
    .text(`Generado el ${fechaStr}`, 50, 52, { align: "center" });
  doc.fontSize(9).fillColor("#64b5f6")
    .text(`Análisis generado en tiempo real: ${lastAnalysisTime || "N/D"}  ·  Datos frescos del tablero Trello + ${cards.length} tareas + documentos PDF del equipo`, 50, 72, { align: "center" });

  doc.y = 128;

  // ── STATS CARDS ────────────────────────────────
  const cardY = doc.y;
  const cardW = 100;
  const cardH = 64;
  const gap = 12;
  const startX = 45;

  const statCards = [
    { label: "TOTAL TAREAS",  value: cards.length,        color: BLUE },
    { label: "COMPLETADAS",   value: completadas.length,  color: GREEN },
    { label: "EN CURSO",      value: enCurso.length,      color: "#0288d1" },
    { label: "ATRASADAS",     value: atrasadas.length,    color: atrasadas.length > 0 ? RED : GREEN },
    { label: "AVANCE",        value: (stats?.pct || 0) + "%", color: stats?.pct >= 70 ? GREEN : stats?.pct >= 40 ? YELLOW : ORANGE },
  ];

  statCards.forEach((s, i) => {
    const x = startX + i * (cardW + gap);
    doc.roundedRect(x, cardY, cardW, cardH, 6).fill(s.color);
    doc.fontSize(24).fillColor(WHITE).font("Helvetica-Bold")
      .text(String(s.value), x, cardY + 8, { width: cardW, align: "center" });
    doc.fontSize(7.5).fillColor(WHITE).font("Helvetica")
      .text(s.label, x, cardY + 42, { width: cardW, align: "center" });
  });

  doc.y = cardY + cardH + 16;

  // ── BARRA DE PROGRESO ──────────────────────────
  const pct = stats?.pct || 0;
  const barX = 50, barW = doc.page.width - 100, barH = 18;
  doc.fontSize(10).fillColor(DARK).font("Helvetica-Bold").text("PROGRESO GENERAL DEL PROYECTO", barX, doc.y);
  doc.moveDown(0.4);
  const barY = doc.y;
  doc.roundedRect(barX, barY, barW, barH, 9).fill("#e0e0e0");
  const fillW = Math.max((barW * pct) / 100, 18);
  const barColor = pct >= 70 ? GREEN : pct >= 40 ? YELLOW : RED;
  doc.roundedRect(barX, barY, fillW, barH, 9).fill(barColor);
  doc.fontSize(9).fillColor(WHITE).font("Helvetica-Bold")
    .text(`${pct}%`, barX + fillW - 28, barY + 4);
  doc.fontSize(8).fillColor(LIGHT_GRAY).font("Helvetica")
    .text(`${completadas.length} completadas de ${cards.length} totales`, barX + barW + 6, barY + 4);
  doc.y = barY + barH + 20;

  // ── ANÁLISIS IA — RENDERIZADO POR SECCIONES ────
  const analysisText = (analysis || "Sin análisis disponible.")
    .replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const lines = analysisText.split("\n");

  checkPageBreak(doc, 40);

  // Cabecera de sección principal
  doc.rect(50, doc.y, doc.page.width - 100, 22).fill(BLUE);
  doc.fontSize(11).fillColor(WHITE).font("Helvetica-Bold")
    .text("🧠  ANÁLISIS EJECUTIVO — GENERADO POR AGENTE IA", 58, doc.y + 5);
  doc.y += 26;
  doc.moveDown(0.3);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) { doc.moveDown(0.3); continue; }

    // Detectar encabezados ## o **Sección**
    if (line.startsWith("## ") || line.match(/^\*\*\d+\./)) {
      checkPageBreak(doc, 36);
      const title = line.replace(/^##\s*/, "").replace(/\*\*/g, "").replace(/^(\d+\.\s*)/, "");
      doc.moveDown(0.6);
      doc.rect(50, doc.y, doc.page.width - 100, 20).fill(SECTION_BG);
      doc.fontSize(10).fillColor(BLUE).font("Helvetica-Bold")
        .text(`▸  ${title}`, 58, doc.y + 4);
      doc.y += 24;
      continue;
    }

    // Detectar listas con - o •
    if (line.startsWith("- ") || line.startsWith("• ") || line.startsWith("* ")) {
      checkPageBreak(doc, 18);
      const bullet = line.replace(/^[-•*]\s*/, "").replace(/\*\*/g, "");
      // Detectar si la línea tiene marcador de severidad
      const isRed = bullet.toLowerCase().includes("alta") || bullet.toLowerCase().includes("crítico");
      const isYellow = bullet.toLowerCase().includes("media") || bullet.toLowerCase().includes("moderado");
      const dotColor = isRed ? RED : isYellow ? YELLOW : BLUE;
      doc.circle(62, doc.y + 5, 3).fill(dotColor);
      doc.fontSize(9.5).fillColor(GRAY).font("Helvetica")
        .text(bullet, 72, doc.y, { width: doc.page.width - 130 });
      doc.y += 16;
      continue;
    }

    // Detectar líneas con **negrita**
    if (line.includes("**")) {
      checkPageBreak(doc, 16);
      const clean = line.replace(/\*\*/g, "");
      doc.fontSize(9.5).fillColor(DARK).font("Helvetica-Bold")
        .text(clean, 58, doc.y, { width: doc.page.width - 110 });
      doc.y += 15;
      continue;
    }

    // Línea normal de párrafo
    checkPageBreak(doc, 15);
    doc.fontSize(9.5).fillColor(GRAY).font("Helvetica")
      .text(line, 58, doc.y, { width: doc.page.width - 110, lineGap: 2 });
    doc.y += doc.heightOfString(line, { width: doc.page.width - 110 }) + 4;
  }

  doc.moveDown(1.2);

  // ── TAREAS ATRASADAS ───────────────────────────
  if (atrasadas.length > 0) {
    checkPageBreak(doc, 60);
    doc.rect(50, doc.y, doc.page.width - 100, 22).fill(RED);
    doc.fontSize(11).fillColor(WHITE).font("Helvetica-Bold")
      .text(`⚠  TAREAS ATRASADAS (${atrasadas.length})`, 58, doc.y + 5);
    doc.y += 28;

    atrasadas.forEach((t, idx) => {
      checkPageBreak(doc, 24);
      const vencio = new Date(t.fecha);
      const dias = Math.floor((ahora - vencio) / (1000 * 60 * 60 * 24));
      const fv = vencio.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
      const rowColor = idx % 2 === 0 ? "#fff8f8" : "#ffebee";
      doc.rect(50, doc.y, doc.page.width - 100, 20).fill(rowColor);
      doc.fontSize(9).fillColor(RED).font("Helvetica-Bold")
        .text(`⚑  ${t.nombre}`, 58, doc.y + 4, { continued: true, width: 260 })
        .fillColor(GRAY).font("Helvetica")
        .text(`  Venció: ${fv}  ·  ${dias} día${dias !== 1 ? "s" : ""} de atraso  ·  ${listMap[t.estado] || "sin fase"}`, { lineBreak: false });
      doc.y += 22;
    });
    doc.moveDown(1);
  }

  // ── TAREAS POR FASE ────────────────────────────
  checkPageBreak(doc, 60);
  doc.rect(50, doc.y, doc.page.width - 100, 22).fill(DARK);
  doc.fontSize(11).fillColor(WHITE).font("Helvetica-Bold")
    .text("📋  DETALLE DE TAREAS POR FASE", 58, doc.y + 5);
  doc.y += 28;

  Object.entries(porFase).forEach(([fase, tareas]) => {
    checkPageBreak(doc, 32);
    const completadasFase = tareas.filter(t => t.completada).length;
    const pctFase = tareas.length ? Math.round(completadasFase / tareas.length * 100) : 0;
    doc.rect(50, doc.y, doc.page.width - 100, 20).fill(SECTION_BG);
    doc.fontSize(10).fillColor(BLUE).font("Helvetica-Bold")
      .text(`▸  ${fase}`, 58, doc.y + 4, { continued: true })
      .fillColor(LIGHT_GRAY).font("Helvetica").fontSize(8.5)
      .text(`  ${tareas.length} tareas  ·  ${pctFase}% completado`, { lineBreak: false });
    doc.y += 24;

    tareas.forEach((t, idx) => {
      checkPageBreak(doc, 16);
      const rowColor = idx % 2 === 0 ? "#fafafa" : "#f0f0f0";
      doc.rect(50, doc.y, doc.page.width - 100, 16).fill(rowColor);
      const icono = t.completada ? "✓" : "○";
      const color = t.completada ? GREEN : GRAY;
      const fechaTexto = t.fecha ? "  ·  " + new Date(t.fecha).toLocaleDateString("es-ES") : "";
      const resps = t.miembros?.length ? `  ·  ${t.miembros.length} resp.` : "";
      doc.fontSize(8.5).fillColor(color).font(t.completada ? "Helvetica-Bold" : "Helvetica")
        .text(`  ${icono}  ${t.nombre}${fechaTexto}${resps}`, 58, doc.y + 3, { width: doc.page.width - 120 });
      doc.y += 17;
    });
    doc.moveDown(0.5);
  });

  // ── FOOTER EN TODAS LAS PÁGINAS ─────────────────
  const pageCount = doc.bufferedPageRange().count;
  for (let i = 0; i < pageCount; i++) {
    doc.switchToPage(i);
    doc.rect(0, doc.page.height - 36, doc.page.width, 36).fill("#f5f7fa");
    doc.fontSize(7.5).fillColor("#aaaaaa").font("Helvetica")
      .text(
        `Reporte generado automáticamente por el Agente IA de Proformax  ·  ${new Date().toLocaleString("es-ES")}  ·  Página ${i + 1} de ${pageCount}`,
        50, doc.page.height - 22, { align: "center", width: doc.page.width - 100 }
      );
  }

  doc.end();
}

// ── HELPERS ─────────────────────────────────────
function checkPageBreak(doc, needed = 50) {
  if (doc.y + needed > doc.page.height - 50) {
    doc.addPage();
    doc.y = 50;
  }
}
