// src/store.js — Persistencia en JSON para el agente
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../data");
const STORE_FILE = path.join(DATA_DIR, "store.json");

// Estructura por defecto del store
const DEFAULT_STORE = {
  // Historial de análisis (los últimos 30)
  analysisHistory: [],
  // Alertas de tareas atrasadas ya enviadas (para no repetir)
  sentAlerts: {},
  // Último snapshot del tablero (para detectar cambios)
  lastBoardSnapshot: null,
  // Log de correos enviados
  emailLog: [],
  // Estadísticas históricas (progreso a lo largo del tiempo)
  statsHistory: [],
  // Historial de conversaciones del chat
  chatSessions: [],
  // Metadata
  createdAt: new Date().toISOString(),
  lastUpdated: null
};

/**
 * Lee el store desde disco. Si no existe, lo crea con valores por defecto.
 */
export function loadStore() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_FILE)) {
      saveStore(DEFAULT_STORE);
      return { ...DEFAULT_STORE };
    }
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    return { ...DEFAULT_STORE, ...JSON.parse(raw) };
  } catch (err) {
    console.error("[Store] Error leyendo store:", err.message);
    return { ...DEFAULT_STORE };
  }
}

/**
 * Guarda el store completo a disco
 */
export function saveStore(store) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    store.lastUpdated = new Date().toISOString();
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), "utf-8");
  } catch (err) {
    console.error("[Store] Error guardando store:", err.message);
  }
}

// ── HELPERS ESPECÍFICOS ────────────────────────────────────────────

/**
 * Guarda un análisis en el historial (máximo 30 entradas)
 */
export function saveAnalysis(store, analysisText, stats) {
  store.analysisHistory.push({
    fecha: new Date().toISOString(),
    analysis: analysisText.slice(0, 5000), // limitar tamaño
    stats: { ...stats }
  });
  // Mantener solo los últimos 30
  if (store.analysisHistory.length > 30) {
    store.analysisHistory = store.analysisHistory.slice(-30);
  }
  saveStore(store);
}

/**
 * Guarda un snapshot del tablero para detectar cambios después
 */
export function saveBoardSnapshot(store, cards) {
  const snapshot = cards.map(c => ({
    id: c.id,
    nombre: c.nombre,
    estado: c.estado,
    fecha: c.fecha,
    completada: c.completada,
    miembros: c.miembros?.length || 0
  }));
  store.lastBoardSnapshot = {
    fecha: new Date().toISOString(),
    cards: snapshot
  };
  saveStore(store);
}

/**
 * Detecta cambios entre el snapshot anterior y el estado actual
 * Retorna un objeto con las diferencias encontradas
 */
export function detectChanges(store, currentCards) {
  if (!store.lastBoardSnapshot) return null;

  const prev = store.lastBoardSnapshot.cards;
  const prevMap = {};
  prev.forEach(c => { prevMap[c.id] = c; });

  const changes = {
    nuevasTareas: [],
    tareasCompletadas: [],
    tareasMovidas: [],
    nuevasAtrasadas: [],
    fecha: new Date().toISOString()
  };

  const ahora = new Date();

  currentCards.forEach(card => {
    const old = prevMap[card.id];
    if (!old) {
      // Tarea nueva
      changes.nuevasTareas.push(card.nombre);
    } else {
      // Tarea completada (antes no, ahora sí)
      if (!old.completada && card.completada) {
        changes.tareasCompletadas.push(card.nombre);
      }
      // Tarea movida de fase
      if (old.estado !== card.estado) {
        changes.tareasMovidas.push({
          nombre: card.nombre,
          deFase: old.estado,
          aFase: card.estado
        });
      }
      // Nueva tarea atrasada (antes no estaba vencida, ahora sí)
      const estabaAtrasada = old.fecha && new Date(old.fecha) < new Date(store.lastBoardSnapshot.fecha) && !old.completada;
      const ahoraAtrasada = card.fecha && new Date(card.fecha) < ahora && !card.completada;
      if (!estabaAtrasada && ahoraAtrasada) {
        changes.nuevasAtrasadas.push(card.nombre);
      }
    }
  });

  const hayAlgo = changes.nuevasTareas.length > 0 ||
    changes.tareasCompletadas.length > 0 ||
    changes.tareasMovidas.length > 0 ||
    changes.nuevasAtrasadas.length > 0;

  return hayAlgo ? changes : null;
}

/**
 * Guarda estadísticas históricas (para ver evolución)
 */
export function saveStatsSnapshot(store, stats) {
  store.statsHistory.push({
    fecha: new Date().toISOString(),
    ...stats
  });
  // Mantener solo los últimos 90 días de snapshots (1 cada 30 min = ~4320, limitamos a 200)
  if (store.statsHistory.length > 200) {
    store.statsHistory = store.statsHistory.slice(-200);
  }
  saveStore(store);
}

/**
 * Registra un correo enviado en el log
 */
export function logEmail(store, { ok, recipients, reason, type = "reporte" }) {
  store.emailLog.push({
    fecha: new Date().toISOString(),
    tipo: type,
    ok,
    recipients: recipients || [],
    reason: reason || null
  });
  // Mantener solo los últimos 100 correos
  if (store.emailLog.length > 100) {
    store.emailLog = store.emailLog.slice(-100);
  }
  saveStore(store);
}

/**
 * Marca una alerta de tarea atrasada como enviada
 */
export function markAlertSent(store, taskId) {
  store.sentAlerts[taskId] = new Date().toISOString();
  saveStore(store);
}

/**
 * Verifica si ya se envió alerta para una tarea hoy
 */
export function wasAlertSentToday(store, taskId) {
  const sent = store.sentAlerts[taskId];
  if (!sent) return false;
  const sentDate = new Date(sent).toDateString();
  const today = new Date().toDateString();
  return sentDate === today;
}

/**
 * Retorna un resumen del historial para dar contexto a la IA
 */
export function getHistorySummary(store) {
  const last3 = store.analysisHistory.slice(-3);
  if (last3.length === 0) return "";

  let summary = "HISTORIAL DE ANÁLISIS ANTERIORES (para contexto de evolución):\n";
  last3.forEach((a, i) => {
    const fecha = new Date(a.fecha).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    summary += `\n--- Análisis ${i + 1} (${fecha}) ---\n`;
    summary += `Progreso: ${a.stats?.pct || 0}% | Tareas: ${a.stats?.total || 0} | Completadas: ${a.stats?.completadas || 0} | Atrasadas: ${a.stats?.atrasadas || 0}\n`;
  });

  // Tendencia
  if (last3.length >= 2) {
    const first = last3[0].stats?.pct || 0;
    const last = last3[last3.length - 1].stats?.pct || 0;
    const diff = last - first;
    if (diff > 0) summary += `\n📈 TENDENCIA: El progreso subió ${diff}% desde el último análisis.\n`;
    else if (diff < 0) summary += `\n📉 TENDENCIA: El progreso bajó ${Math.abs(diff)}% — posible problema.\n`;
    else summary += `\n➡️ TENDENCIA: Sin cambios en progreso.\n`;
  }

  return summary;
}
