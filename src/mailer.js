// src/mailer.js
import nodemailer from "nodemailer";
import { config } from "./config.js";

/**
 * Envía un correo usando la API HTTP de Brevo (Bypassa el bloqueo SMTP de Render)
 */
async function sendViaBrevo(mailOptions) {
  if (!config.brevoKey) return null;

  const to = mailOptions.to.split(",").map(email => ({ email: email.trim() }));
  
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": config.brevoKey
    },
    body: JSON.stringify({
      sender: { name: "Agente IA Proformax", email: config.senderEmail },
      to: to,
      subject: mailOptions.subject,
      htmlContent: mailOptions.html
    })
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo API error: ${err}`);
  }

  return await res.json();
}

/**
 * Fallback SMTP (Para local)
 */
async function sendViaSmtp(mailOptions) {
  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: Number(config.smtpPort) || 465,
    secure: Number(config.smtpPort) === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass
    }
  });

  return await transporter.sendMail(mailOptions);
}

async function unifiedSend(mailOptions) {
  try {
    const brevo = await sendViaBrevo(mailOptions);
    if (brevo) {
      console.log("[Mailer] Enviado via Brevo API");
      return { ok: true, messageId: brevo.messageId };
    }
  } catch (e) {
    console.warn("[Mailer] Falló Brevo, intentando SMTP...", e.message);
  }

  const smtp = await sendViaSmtp(mailOptions);
  console.log("[Mailer] Enviado via SMTP");
  return { ok: true, messageId: smtp.messageId };
}

function toHtml(text) {
  return text
    .replace(/\n/g, "<br/>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/### (.*?)\n/g, "<h3>$1</h3>");
}

export async function sendProgressReport(analysis, pdfsLeidos = [], stats = {}) {
  const recipients = config.teamEmails;
  const fecha = new Date().toLocaleDateString("es-ES");

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
      <h2 style="color: #1a73e8;">Reporte de Progreso — Proformax</h2>
      <p><strong>Fecha:</strong> ${fecha}</p>
      <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
        ${toHtml(analysis)}
      </div>
      <div style="margin-top: 20px;">
        <p><strong>Tareas:</strong> ${stats.total} | <strong>Completadas:</strong> ${stats.completadas} (${stats.pct}%)</p>
      </div>
      <hr/>
      <p style="font-size: 12px; color: #666;">Generado automáticamente por Trello AI Agent</p>
    </div>
  `;

  try {
    return await unifiedSend({
      to: recipients,
      subject: `📊 Reporte Proformax — ${fecha} | Avance: ${stats.pct}%`,
      html
    });
  } catch (err) {
    console.error("[Mailer] Error fatal:", err.message);
    return { ok: false, reason: err.message };
  }
}

export async function sendAlertEmail(tareasAtrasadas, allCards = []) {
  const recipients = config.teamEmails;
  const html = `<h3>⚠️ Alerta de Tareas Atrasadas</h3><ul>${tareasAtrasadas.map(t => `<li>${t}</li>`).join("")}</ul>`;

  try {
    return await unifiedSend({
      to: recipients,
      subject: `⚠️ ALERTA: ${tareasAtrasadas.length} tareas atrasadas`,
      html
    });
  } catch (err) {
    console.error("[Mailer] Error en alerta:", err.message);
    return { ok: false, reason: err.message };
  }
}
