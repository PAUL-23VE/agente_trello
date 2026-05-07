// src/agent.js
import { getBoardData } from "./trello.js";
import { analyze } from "./ai.js";

export async function runAgent() {
  try {
    console.log("Obteniendo tareas...");

    const { cards, lists } = await getBoardData();

    if (!cards.length) {
      console.log("No hay datos en el tablero");
      return;
    }

    const ahora = new Date();

    const atrasadas = cards.filter(c =>
      c.fecha && new Date(c.fecha) < ahora && !c.completada
    );

    const sinAsignar = cards.filter(c =>
      !c.miembros || c.miembros.length === 0
    );

    const completadas = cards.filter(c => c.completada);

    console.log(`Total tareas: ${cards.length}`);
    console.log(`Completadas: ${completadas.length} (${Math.round(completadas.length / cards.length * 100)}%)`);
    console.log(`En progreso: ${cards.length - completadas.length}`);
    console.log(`Tareas atrasadas: ${atrasadas.length}`);
    console.log(`Tareas sin asignar: ${sinAsignar.length}`);

    console.log("Analizando con IA...");

    const result = await analyze(cards, lists, atrasadas, sinAsignar);

    console.log("\n===== RESULTADO DEL ANÁLISIS =====\n");
    console.log(result);

  } catch (error) {
    console.error("Error en el agente:", error.message);
  }
}