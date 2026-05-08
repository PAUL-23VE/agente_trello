// src/ai.js — Migrado a Groq API (gratis, ultrarrápido)
import fetch from "node-fetch";
import { config } from "./config.js";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Llama a Groq API con el prompt dado
 */
async function callGroq(prompt, options = {}) {
  const model = options.model || "llama-3.3-70b-versatile";
  const temperature = options.temperature ?? 0.4;
  const maxTokens = options.maxTokens || 2048;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000); // 2 min

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.groqKey}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature,
        max_tokens: maxTokens,
        top_p: options.topP ?? 0.9
      })
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      console.error(`[Groq] Error HTTP ${res.status}:`, err);
      throw new Error(`Groq respondió con error ${res.status}`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) {
      console.warn("[Groq] Respuesta vacía:", JSON.stringify(data).slice(0, 500));
      return "No se pudo generar una respuesta.";
    }

    return text.trim();

  } catch (error) {
    clearTimeout(timeout);
    if (error.name === "AbortError") {
      console.error("[Groq] Timeout: la solicitud tardó más de 2 minutos.");
      return "La IA no respondió a tiempo.";
    }
    console.error("[Groq] Error:", error.message);
    return "Error al contactar la IA.";
  }
}

/**
 * Analiza el tablero de Trello con IA
 */
export async function analyze(cards, lists, atrasadas = [], sinAsignar = [], pdfContext = "") {
  const listMap = {};
  lists.forEach(l => { listMap[l.id] = l.name; });

  const simplified = cards.map(c => ({
    nombre: c.nombre,
    fecha: c.fecha,
    estado: listMap[c.estado],
    miembros: c.miembros?.length || 0,
    completada: c.completada
  }));

  const prompt = `
Eres un LÍDER TÉCNICO experto en gestión de proyectos de software.

CONTEXTO TEMPORAL CRÍTICO:
- Fecha actual: ${new Date().toLocaleDateString("es-ES", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
- El proyecto usa fases como columnas de Trello (Fase 1: Planificación, Fase 2: Diseño, Fase 3: Desarrollo, etc.)
- La fase en la que se encuentra una tarea indica su etapa en el ciclo de vida, NO que esté terminada
- Una tarea está "completada" solo si su campo completada=true
- Una tarea en "Fase 3: Desarrollo" significa que está EN DESARROLLO, no terminada

LISTAS DEL TABLERO (fases reales):
${Object.values(Object.fromEntries(lists.map(l => [l.id, l.name]))).join(" → ")}

TODAS LAS TAREAS (${simplified.length} total):
${simplified.map(t =>
  `- [${t.completada ? "✅ COMPLETA" : "🔄 EN CURSO"}] "${t.nombre}" | Fase: ${t.estado} | Fecha límite: ${t.fecha || "sin fecha"} | Responsables: ${t.miembros}`
).join("\n")}

TAREAS CON FECHA VENCIDA (${atrasadas.length}):
${atrasadas.length > 0 ? atrasadas.map(t => {
  const vencio = new Date(t.fecha);
  const ahora = new Date();
  const dias = Math.floor((ahora - vencio) / (1000 * 60 * 60 * 24));
  const fv = vencio.toLocaleDateString("es-ES", { day:"2-digit", month:"short", year:"numeric" });
  const fh = ahora.toLocaleDateString("es-ES", { day:"2-digit", month:"short", year:"numeric" });
  return `- "${t.nombre}" | venció: ${fv} → hoy: ${fh} | ${dias} dias de atraso`;
}).join("\n") : "Ninguna"}

TAREAS SIN RESPONSABLE ASIGNADO (${sinAsignar.length}):
${sinAsignar.length > 0 ? sinAsignar.map(t => `- "${t.nombre}" en ${t.estado}`).join("\n") : "Todas asignadas"}

Haz un análisis PROFESIONAL basado ÚNICAMENTE en los datos anteriores:

1. **Estado real del proyecto** (¿en qué fase estamos HOY según las tareas activas?)
2. **Progreso real** (cuántas tareas completadas vs pendientes, %)
3. **Problemas detectados** (usa nombres reales de tareas y fechas reales)
4. **Riesgos** (basados en fechas vencidas, tareas sin asignar, cuellos de botella)
5. **Recomendaciones concretas** (acciones específicas del equipo)
6. **Qué hacer AHORA** (top 3 prioridades inmediatas)

REGLAS ESTRICTAS:
- NUNCA asumas que el proyecto está terminado si hay tareas con completada=false
- NUNCA inventes datos que no estén en la lista de tareas
- Usa los nombres REALES de las tareas
- Sé crítico y honesto, no optimista sin datos
- La fase de una tarea NO significa que esté hecha
${pdfContext ? `\n${pdfContext.slice(0, 2000)}` : ""}
`;

  return await callGroq(prompt, {
    model: "llama-3.1-8b-instant",
    temperature: 0.3,
    maxTokens: 3000
  });
}

/**
 * Responde una pregunta de seguimiento usando el contexto del tablero + historial de chat
 */
export async function chat(userMessage, boardContext, history = []) {
  // Groq 8B instant: 6K TPM — optimizamos contexto al máximo
  const ctxCompleto = boardContext.slice(0, 1500);

  const historialReciente = history.slice(-4).map(m =>
    `${m.role === "user" ? "USUARIO" : "ASISTENTE"}: ${m.content?.slice(0, 200) || ""}`
  ).join("\n");

  const prompt = `Eres un asistente senior de gestión de proyectos para el proyecto "Proformax". Tu rol es responder con análisis profundos, concretos y útiles basados en los datos reales del tablero Trello y los documentos PDF del equipo.

REGLAS CRÍTICAS:
- Si piden generar/crear/exportar PDF responde: "Usa el botón ⬇ PDF en la cabecera para descargar el reporte actualizado."
- Responde SIEMPRE en español.
- Da respuestas COMPLETAS y DETALLADAS, no cortes la respuesta a la mitad.
- Usa los nombres reales de tareas, fechas y personas del contexto.
- Si hay historial, mantén coherencia con lo que ya se respondió.
- No repitas el enunciado de la pregunta, ve directo a la respuesta.
- Si preguntan por algo específico (un módulo, una persona, una fecha), busca en el contexto y da detalles precisos.
- NUNCA inventes datos que no estén en el contexto.

CONTEXTO DEL PROYECTO (tablero + documentos PDF):
${ctxCompleto}

${historialReciente ? `CONVERSACIÓN PREVIA:\n${historialReciente}\n` : ""}
PREGUNTA DEL USUARIO: ${userMessage}

RESPUESTA DETALLADA:`;

  return await callGroq(prompt, {
    model: "llama-3.1-8b-instant",
    temperature: 0.4,
    maxTokens: 1500,
    topP: 0.9
  });
}

/**
 * Genera un análisis ESPECÍFICO y profundo para el reporte PDF
 */
export async function analyzeForReport(cards, lists, atrasadas, sinAsignar, pdfContext = "") {
  const listMap = {};
  lists.forEach(l => { listMap[l.id] = l.name; });

  const simplified = cards.map(c => ({
    nombre: c.nombre,
    fecha: c.fecha,
    estado: listMap[c.estado],
    miembros: c.miembros?.length || 0,
    completada: c.completada
  }));

  const ahora = new Date();
  const completadas = cards.filter(c => c.completada);
  const pct = cards.length ? Math.round(completadas.length / cards.length * 100) : 0;

  const prompt = `Eres un DIRECTOR DE PROYECTO experto. Genera un REPORTE EJECUTIVO COMPLETO del proyecto Proformax basado en todos los datos disponibles.

FECHA DEL REPORTE: ${ahora.toLocaleDateString("es-ES", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}
PROGRESO ACTUAL: ${pct}% (${completadas.length} de ${cards.length} tareas completadas)

FASES DEL PROYECTO:
${[...new Set(simplified.map(t => t.estado))].map((f, i) => `  Fase ${i+1}: ${f}`).join("\n")}

TAREAS ACTIVAS (${simplified.filter(t => !t.completada).length}):
${simplified.filter(t => !t.completada).map(t =>
  `  - "${t.nombre}" | ${t.estado} | Vence: ${t.fecha ? new Date(t.fecha).toLocaleDateString("es-ES") : "sin fecha"} | Responsables: ${t.miembros}`
).join("\n")}

TAREAS COMPLETADAS (${completadas.length}):
${simplified.filter(t => t.completada).map(t => `  ✓ "${t.nombre}" | ${t.estado}`).join("\n")}

TAREAS VENCIDAS (${atrasadas.length}):
${atrasadas.length > 0 ? atrasadas.map(t => {
  const dias = Math.floor((ahora - new Date(t.fecha)) / (1000 * 60 * 60 * 24));
  return `  ⚠ "${t.nombre}" | ${dias} días de atraso | ${listMap[t.estado]}`;
}).join("\n") : "  Ninguna"}

TAREAS SIN RESPONSABLE: ${sinAsignar.length}
${sinAsignar.map(t => `  - "${t.nombre}"`).join("\n")}

${pdfContext ? `DOCUMENTOS TÉCNICOS DEL PROYECTO:\n${pdfContext.slice(0, 20000)}` : ""}

Genera el reporte con estas secciones COMPLETAS y DETALLADAS:

## 1. ESTADO EJECUTIVO DEL PROYECTO
Describe el estado real actual, en qué fase se encuentra el proyecto HOY, qué se ha logrado y qué falta.

## 2. ANÁLISIS DE PROGRESO
Analiza el ${pct}% de avance: ¿es adecuado para la fecha? ¿va a ritmo? Menciona tareas clave completadas y pendientes.

## 3. HALLAZGOS EN DOCUMENTOS
Basado en los documentos PDF subidos, identifica hallazgos importantes: qué módulos están documentados, qué inconsistencias hay entre documentos y tablero, qué falta documentar.

## 4. RIESGOS Y PROBLEMAS DETECTADOS
Lista concreta de riesgos con nombres reales de tareas, personas y fechas. Clasifica por severidad (Alta/Media/Baja).

## 5. RECOMENDACIONES INMEDIATAS
Top 5 acciones específicas que el equipo debe tomar ESTA SEMANA, con responsables sugeridos.

## 6. PROYECCIÓN DE CIERRE
Con el ritmo actual, ¿cuándo termina el proyecto? ¿Qué podría adelantar o retrasar el cierre?

IMPORTANTE: Sé específico, usa nombres reales, no seas genérico. Este reporte lo leerá el cliente y el equipo directivo.`;

  return await callGroq(prompt, {
    model: "llama-3.1-8b-instant",
    temperature: 0.3,
    maxTokens: 4096,
    topP: 0.85
  });
}