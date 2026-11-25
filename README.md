# 🤖 Agente IA para Trello

Agente que se conecta a un tablero de **Trello**, analiza el avance del equipo con **inteligencia artificial** y avisa por correo. Incluye un panel web para conversar con el agente, revisar el análisis y generar reportes.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white) ![Express](https://img.shields.io/badge/Express-000000?style=flat-square&logo=express&logoColor=white) ![Trello API](https://img.shields.io/badge/Trello%20API-0052CC?style=flat-square&logo=trello&logoColor=white) ![Groq](https://img.shields.io/badge/Groq-F55036?style=flat-square) ![node-cron](https://img.shields.io/badge/node--cron-10B981?style=flat-square)

## ✨ Funcionalidades

- **Análisis del tablero:** total de tareas, % completado, tareas atrasadas y sin asignar, con un resumen generado por IA (Groq).
- **Chat con el agente:** preguntas sobre el proyecto y creación de tarjetas en Trello desde la conversación.
- **Documentos del proyecto:** carga de PDFs (informes, requerimientos, diseños) que el agente usa como contexto.
- **Reportes:** reporte de avance en PDF y envío por correo al equipo (SMTP o Brevo).
- **Tareas programadas** con `node-cron`: análisis periódico y reporte diario automático.
- **Revisión de código:** lectura de pull requests abiertos en GitHub y comentarios de revisión.

## 🗂️ Estructura

```
src/
  app.js        # servidor Express, API y tareas programadas
  agent.js      # análisis del tablero
  ai.js         # integración con el modelo de IA
  trello.js     # API de Trello
  github.js     # pull requests y revisiones
  pdf.js        # lectura de documentos PDF
  reportPDF.js  # generación del reporte en PDF
  mailer.js     # envío de correos
public/         # panel web
docs/           # documentación del proyecto analizado
```

## 🚀 Cómo ejecutarlo

```bash
npm install
npm start        # o: npm run dev (recarga automática)
```

Crea un archivo `.env` con tus credenciales (no lo subas al repositorio):

```env
TRELLO_KEY=...
TRELLO_TOKEN=...
BOARD_ID=...
GROQ_API_KEY=...
GITHUB_TOKEN=...
GITHUB_REPO=usuario/repositorio
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
TEAM_EMAILS=correo1@ejemplo.com,correo2@ejemplo.com
PORT=3000
```

---

<sub>⚽ Parte del portafolio de **Paul Velastegui** · [paul-23ve.github.io](https://paul-23ve.github.io) · [GitHub](https://github.com/PAUL-23VE)</sub>
