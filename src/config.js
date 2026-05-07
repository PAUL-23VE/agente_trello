// src/config.js
import dotenv from "dotenv";
dotenv.config();

export const config = {
  key: process.env.TRELLO_KEY,
  token: process.env.TRELLO_TOKEN,
  boardId: process.env.BOARD_ID,
  // IA — Groq API (gratis, ultrarrápido)
  groqKey: process.env.GROQ_API_KEY,
  // Email
  smtpHost: process.env.SMTP_HOST || "smtp.gmail.com",
  smtpPort: process.env.SMTP_PORT || "587",
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  teamEmails: process.env.TEAM_EMAILS  // separados por coma: "a@x.com,b@x.com"
};
