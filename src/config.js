// src/config.js
import dotenv from "dotenv";
dotenv.config();

export const config = {
  key: process.env.TRELLO_KEY,
  token: process.env.TRELLO_TOKEN,
  boardId: process.env.BOARD_ID,
  // IA — Groq API (gratis, ultrarrápido)
  groqKey: process.env.GROQ_API_KEY,
  // Email — Brevo HTTP API (Necesario para Render)
  brevoKey: process.env.BREVO_API_KEY,
  senderEmail: process.env.SMTP_USER || "paulvelastegui2016@gmail.com",
  teamEmails: process.env.TEAM_EMAILS,
  // SMTP fallback
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: process.env.SMTP_PORT || "465",
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS
};
