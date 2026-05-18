// src/ai.js
import fetch from "node-fetch";
import { config } from "./config.js";

/**
 * Función genérica para llamar a la IA (Groq o Ollama)
 */
async function callAI(prompt, model = "llama3-8b-8192") {
  try {
    // Si hay Groq Key, usamos Groq (Cloud - Recomendado para Render)
    if (config.groqKeys && config.groqKeys.length > 0) {
      // Mezclar llaves para empezar con una aleatoria y usar las demás como fallback
      const shuffledKeys = [...config.groqKeys].sort(() => 0.5 - Math.random());
      
      for (let i = 0; i < shuffledKeys.length; i++) {
        const keyToUse = shuffledKeys[i];
        console.log(`[IA] Usando Groq con modelo: ${model} (Intento ${i+1}/${shuffledKeys.length})`);
        
        try {
          const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${keyToUse}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              model: model,
              messages: [{ role: "user", content: prompt }],
              temperature: 0.7
            })
          });

          if (!res.ok) {
            const errBody = await res.text();
            console.error(`[IA] Error Groq API (${res.status}):`, errBody);
            // Si es error de rate limit (429), y quedan más llaves, intentar con la siguiente
            if (res.status === 429 && i < shuffledKeys.length - 1) {
              console.warn("[IA] Límite de tokens alcanzado. Cambiando a otra llave API...");
              continue; // Salta al siguiente iterador del for
            }
            throw new Error(`Groq falló: ${res.status}`);
          }
          
          const data = await res.json();
          return data.choices[0]?.message?.content || "No hubo respuesta de la IA.";
        } catch (innerError) {
          if (i === shuffledKeys.length - 1) throw innerError; // Si es el último, lanza el error
        }
      }
    }

    // Fallback: Ollama local
    console.log("[IA] Groq no configurado, intentando Ollama local...");
    const ollamaUrl = config.ollama || "http://127.0.0.1:11434";
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemma:2b",
        stream: false,
        prompt
      })
    });

    if (!res.ok) throw new Error("Ollama no disponible");
    const data = await res.json();
    return data.response;

  } catch (error) {
    console.error("Error en callAI:", error.message);
    return "Error al contactar la IA.";
  }
}

export async function analyze(cards, lists, atrasadas = [], sinAsignar = [], pdfContext = "") {
  const listMap = {};
  lists.forEach(l => { listMap[l.id] = l.name; });

  const simplified = cards.map(c => ({
    nombre: c.nombre,
    fecha: c.fecha,
    estado: listMap[c.estado],
    completada: c.completada
  }));

  const prompt = `
Eres un LÍDER TÉCNICO experto. Analiza el estado de este proyecto:
FECHA HOY: ${new Date().toLocaleDateString("es-ES")}

LISTAS: ${lists.map(l => l.name).join(" -> ")}

RESUMEN TAREAS:
${simplified.map(t => `- [${t.completada ? "✅" : "🔄"}] "${t.nombre}" en ${t.estado} (vence: ${t.fecha || "sin fecha"})`).join("\n")}

ATRASADAS (${atrasadas.length}):
${atrasadas.map(t => `- "${t.nombre}" (vencida)`).join("\n")}

SIN ASIGNAR: ${sinAsignar.length}

${pdfContext ? `CONTEXTO DOCUMENTOS:\n${pdfContext.slice(0, 2000)}` : ""}

Genera un informe ejecutivo breve:
1. Estado General
2. Progreso (%)
3. Riesgos críticos
4. Próximos pasos inmediatos`;

  return await callAI(prompt);
}

/**
 * Especial para reportes PDF - Análisis más profundo
 */
export async function analyzeForReport(cards, lists, atrasadas = [], sinAsignar = [], pdfContext = "") {
  // Limitamos el contexto de los PDFs a 1500 caracteres para no saturar los tokens de Groq
  const pdfContextLimitado = pdfContext ? pdfContext.slice(0, 1500) : "";

  const prompt = `
Genera un REPORTE DETALLADO para el PDF de gerencia.
PROYECTO: PROFORMAX
FECHA: ${new Date().toLocaleDateString("es-ES")}

DATOS:
- Total tareas: ${cards.length}
- Atrasadas: ${atrasadas.length}
- Sin asignar: ${sinAsignar.length}

${pdfContextLimitado ? `CONTEXTO TÉCNICO (resumen documentos):\n${pdfContextLimitado}` : ""}

INSTRUCCIONES:
- Sé formal y profesional.
- Evalúa el cumplimiento de hitos.
- Proporciona una visión técnica de los cuellos de botella.
- No uses placeholders, sé específico con los datos entregados.`;

  return await callAI(prompt, "llama3-70b-8192");
}

export async function chat(userMessage, boardContext, history = []) {
  const historyText = history.slice(-5).map(h => `${h.role}: ${h.content}`).join("\n");
  const prompt = `Eres un asistente de gestión de proyectos. Contexto del tablero:
${boardContext}

${historyText ? `Historial:\n${historyText}` : ""}
Usuario: ${userMessage}
Respuesta corta y directa:`;

  return await callAI(prompt);
}