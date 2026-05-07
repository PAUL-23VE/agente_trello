// src/mailer.js
import nodemailer from "nodemailer";
import { config } from "./config.js";

/**
 * Crea el transporter según la config del .env
 */
function createTransporter() {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort) || 587,
    secure: false,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass
    }
  });
}

/**
 * Convierte texto plano con markdown básico a HTML bonito para el correo
 */
function toHtml(text) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<h3 style='color:#1a73e8;margin:12px 0 4px'>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2 style='color:#1a73e8;margin:16px 0 6px'>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1 style='color:#1a73e8;margin:20px 0 8px'>$1</h1>")
    .replace(/^[-*] (.+)$/gm, "<li style='margin:4px 0'>$1</li>")
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style='padding-left:20px;margin:8px 0'>${m}</ul>`)
    .replace(/\n\n/g, "</p><p style='margin:8px 0'>")
    .replace(/\n/g, "<br/>");
}

/**
 * Envía el reporte de progreso a todos los integrantes
 * @param {string} analysis - Texto del análisis de la IA
 * @param {Array}  pdfsLeidos - Array de PDFs procesados
 * @param {Object} stats - { total, completadas, atrasadas, pct }
 */
export async function sendProgressReport(analysis, pdfsLeidos = [], stats = {}) {
  if (!config.smtpUser || !config.teamEmails) {
    console.warn("[Mailer] No configurado. Agrega SMTP_USER y TEAM_EMAILS al .env");
    return { ok: false, reason: "Sin configuración SMTP" };
  }

  const transporter = createTransporter();
  const recipients = config.teamEmails.split(",").map(e => e.trim()).filter(Boolean);
  const fecha = new Date().toLocaleDateString("es-ES", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  // Sección PDFs
  const pdfsHtml = pdfsLeidos.length > 0
    ? `<h2 style='color:#1a73e8'>📎 Documentos analizados (${pdfsLeidos.length})</h2>
       <ul style='padding-left:20px'>
         ${pdfsLeidos.map(p => `<li><strong>${p.nombre}</strong> — ${p.paginas} pág. — subido: ${p.subido}</li>`).join("")}
       </ul>`
    : `<p style='color:#888'>No hay documentos PDF en la carpeta /docs.</p>`;

  // Badges de stats
  const badgeColor = (n, ok = 0) => n > ok ? "#f44336" : "#4caf50";
  const statsHtml = `
    <div style='display:flex;gap:16px;flex-wrap:wrap;margin:16px 0'>
      <div style='background:#1a73e8;color:#fff;padding:12px 20px;border-radius:8px;text-align:center'>
        <div style='font-size:28px;font-weight:700'>${stats.total || 0}</div>
        <div style='font-size:11px;text-transform:uppercase'>Total tareas</div>
      </div>
      <div style='background:#4caf50;color:#fff;padding:12px 20px;border-radius:8px;text-align:center'>
        <div style='font-size:28px;font-weight:700'>${stats.completadas || 0}</div>
        <div style='font-size:11px;text-transform:uppercase'>Completadas</div>
      </div>
      <div style='background:${badgeColor(stats.atrasadas)};color:#fff;padding:12px 20px;border-radius:8px;text-align:center'>
        <div style='font-size:28px;font-weight:700'>${stats.atrasadas || 0}</div>
        <div style='font-size:11px;text-transform:uppercase'>Atrasadas</div>
      </div>
      <div style='background:#ff9800;color:#fff;padding:12px 20px;border-radius:8px;text-align:center'>
        <div style='font-size:28px;font-weight:700'>${stats.pct || 0}%</div>
        <div style='font-size:11px;text-transform:uppercase'>Avance</div>
      </div>
    </div>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style='font-family:Segoe UI,Arial,sans-serif;background:#f5f5f5;padding:0;margin:0'>
  <div style='max-width:680px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)'>

    <!-- HEADER -->
    <div style='background:linear-gradient(135deg,#1a73e8,#0d47a1);padding:32px;text-align:center'>
      <div style='font-size:40px'>🤖</div>
      <h1 style='color:#fff;margin:8px 0 4px;font-size:22px'>Reporte de Progreso — Proformax</h1>
      <p style='color:#90caf9;margin:0;font-size:14px'>${fecha}</p>
    </div>

    <!-- STATS -->
    <div style='padding:24px 32px 0'>
      <h2 style='color:#333;margin:0 0 12px'>📊 Estado del Proyecto</h2>
      ${statsHtml}
    </div>

    <!-- ANÁLISIS -->
    <div style='padding:24px 32px'>
      <h2 style='color:#333;margin:0 0 12px'>🧠 Análisis del Agente IA</h2>
      <div style='background:#f8f9fa;border-left:4px solid #1a73e8;border-radius:4px;padding:16px;font-size:14px;line-height:1.7;color:#333'>
        <p style='margin:8px 0'>${toHtml(analysis)}</p>
      </div>
    </div>

    <!-- PDFs -->
    <div style='padding:0 32px 24px'>
      ${pdfsHtml}
    </div>

    <!-- FOOTER -->
    <div style='background:#f5f5f5;padding:16px 32px;text-align:center;border-top:1px solid #e0e0e0'>
      <p style='color:#999;font-size:12px;margin:0'>
        Este reporte fue generado automáticamente por el Agente IA de Proformax.<br/>
        Reporte enviado el ${new Date().toLocaleString("es-ES")}
      </p>
    </div>
  </div>
</body>
</html>`;

  try {
    const info = await transporter.sendMail({
      from: `"Agente IA Proformax" <${config.smtpUser}>`,
      to: recipients.join(", "),
      subject: `📊 Reporte Proformax — ${fecha} | Avance: ${stats.pct || 0}%`,
      html
    });

    console.log(`[Mailer] Correo enviado a: ${recipients.join(", ")} | ID: ${info.messageId}`);
    return { ok: true, recipients, messageId: info.messageId };
  } catch (err) {
    console.error("[Mailer] Error enviando correo:", err.message);
    return { ok: false, reason: err.message };
  }
}

/**
 * Envía una alerta urgente cuando se detectan tareas recién atrasadas
 * @param {string[]} tareasAtrasadas - Nombres de tareas que se acaban de atrasar
 * @param {Array} allCards - Todas las tarjetas para buscar detalles
 */
export async function sendAlertEmail(tareasAtrasadas, allCards = []) {
  if (!config.smtpUser || !config.teamEmails) {
    return { ok: false, reason: "Sin configuración SMTP" };
  }

  const transporter = createTransporter();
  const recipients = config.teamEmails.split(",").map(e => e.trim()).filter(Boolean);
  const fecha = new Date().toLocaleString("es-ES");

  const tareasHtml = tareasAtrasadas.map(nombre => {
    const card = allCards.find(c => c.nombre === nombre);
    const vencio = card?.fecha ? new Date(card.fecha).toLocaleDateString("es-ES") : "sin fecha";
    const dias = card?.fecha ? Math.floor((new Date() - new Date(card.fecha)) / (1000*60*60*24)) : 0;
    return `<tr>
      <td style="padding:10px 14px;border-bottom:1px solid #ffcdd2"><strong>${nombre}</strong></td>
      <td style="padding:10px 14px;border-bottom:1px solid #ffcdd2;color:#c62828">${vencio}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #ffcdd2;color:#c62828;font-weight:700">${dias} día(s)</td>
    </tr>`;
  }).join("");

  const html = `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"/></head>
<body style="font-family:Segoe UI,Arial,sans-serif;background:#f5f5f5;padding:0;margin:0">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.1)">
    <div style="background:linear-gradient(135deg,#c62828,#e65100);padding:28px;text-align:center">
      <div style="font-size:36px">⚠️</div>
      <h1 style="color:#fff;margin:8px 0 4px;font-size:20px">ALERTA — Tareas Atrasadas Detectadas</h1>
      <p style="color:#ffcdd2;margin:0;font-size:13px">${fecha}</p>
    </div>
    <div style="padding:24px 28px">
      <p style="color:#333;font-size:14px;margin:0 0 16px">
        El agente detectó <strong style="color:#c62828">${tareasAtrasadas.length} tarea(s)</strong> que se han atrasado recientemente:
      </p>
      <table style="width:100%;border-collapse:collapse;background:#fff8f8;border-radius:8px;overflow:hidden">
        <thead>
          <tr style="background:#ffebee">
            <th style="padding:10px 14px;text-align:left;font-size:12px;color:#c62828">TAREA</th>
            <th style="padding:10px 14px;text-align:left;font-size:12px;color:#c62828">VENCIÓ</th>
            <th style="padding:10px 14px;text-align:left;font-size:12px;color:#c62828">ATRASO</th>
          </tr>
        </thead>
        <tbody>${tareasHtml}</tbody>
      </table>
      <p style="color:#888;font-size:12px;margin:20px 0 0;text-align:center">
        Revisa el tablero y toma acción inmediata. Este correo fue generado automáticamente por el Agente IA de Proformax.
      </p>
    </div>
  </div>
</body></html>`;

  try {
    const info = await transporter.sendMail({
      from: `"⚠️ Alerta Proformax" <${config.smtpUser}>`,
      to: recipients.join(", "),
      subject: `⚠️ ALERTA: ${tareasAtrasadas.length} tarea(s) atrasada(s) — ${new Date().toLocaleDateString("es-ES")}`,
      html
    });

    console.log(`[Mailer] Alerta enviada a: ${recipients.join(", ")}`);
    return { ok: true, recipients, messageId: info.messageId };
  } catch (err) {
    console.error("[Mailer] Error enviando alerta:", err.message);
    return { ok: false, reason: err.message };
  }
}
