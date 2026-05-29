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
  // El reporte de progreso global solo se envía al Product Owner
  const recipients = config.poEmail ? [config.poEmail] : [];
  if (recipients.length === 0) {
    console.warn("[Mailer] No hay poEmail configurado para el reporte diario.");
    return { ok: false, reason: "No PO email configured" };
  }
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
  if (!config.memberEmails || !config.poEmail) {
    console.warn("[Mailer] memberEmails o poEmail no configurados en config.js");
    return { ok: false, reason: "Configuración de correos incompleta" };
  }

  // Mapa de usuario -> Tareas
  const tasksByEmail = {};
  
  // El PO siempre recibe todas las tareas
  tasksByEmail[config.poEmail] = [...tareasAtrasadas];

  // Distribuir a los desarrolladores
  tareasAtrasadas.forEach(tareaNombre => {
    // Buscar la tarjeta completa para ver quién está asignado
    const card = allCards.find(c => c.nombre === tareaNombre);
    if (card && card.memberUsernames) {
      card.memberUsernames.forEach(username => {
        const email = config.memberEmails[username];
        if (email && email !== config.poEmail) {
          if (!tasksByEmail[email]) tasksByEmail[email] = [];
          tasksByEmail[email].push(tareaNombre);
        }
      });
    }
  });

  let lastResult = null;
  const sentEmails = [];

  // Enviar un correo personalizado a cada persona
  for (const [email, tasks] of Object.entries(tasksByEmail)) {
    if (tasks.length === 0) continue;

    const isPO = email === config.poEmail;
    const title = isPO 
      ? `⚠️ ALERTA GLOBAL: ${tasks.length} tareas atrasadas en el proyecto`
      : `⚠️ Tienes ${tasks.length} tarea(s) atrasada(s) asignada(s)`;

    const html = `<h3>${title}</h3>
      <p>Hola, las siguientes tareas requieren tu atención inmediata:</p>
      <ul>${tasks.map(t => `<li>${t}</li>`).join("")}</ul>`;

    try {
      lastResult = await unifiedSend({
        to: email, // enviamos solo a esta persona
        subject: title,
        html
      });
      if (lastResult && lastResult.ok) sentEmails.push(email);
    } catch (err) {
      console.error(`[Mailer] Error enviando alerta a ${email}:`, err.message);
    }
  }

  if (sentEmails.length > 0) {
    return { ok: true, recipients: sentEmails, messageId: lastResult?.messageId };
  } else {
    return { ok: false, reason: "No emails sent" };
  }
}
