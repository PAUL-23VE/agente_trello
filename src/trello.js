// src/trello.js
import axios from "axios";
import { config } from "./config.js";

export async function getBoardData() {
  try {
    const [cardsRes, listsRes] = await Promise.all([
      axios.get(`https://api.trello.com/1/boards/${config.boardId}/cards`, {
        params: {
          key: config.key,
          token: config.token
        }
      }),
      axios.get(`https://api.trello.com/1/boards/${config.boardId}/lists`, {
        params: {
          key: config.key,
          token: config.token
        }
      })
    ]);

    // 🔥 NORMALIZAMOS AQUÍ (CLAVE)
    // Detectar listas que representan "completado" por su nombre
    const completedListNames = ["hecho", "done", "completado", "terminado", "finalizado", "entregado"];
    const listMap = {};
    listsRes.data.forEach(l => { listMap[l.id] = l.name; });

    const cards = cardsRes.data.map(c => {
      const listName = (listMap[c.idList] || "").toLowerCase();
      const completadaPorLista = completedListNames.some(n => listName.includes(n));
      return {
        id: c.id,
        nombre: c.name,
        fecha: c.due,
        descripcion: c.desc,
        miembros: c.idMembers,
        estado: c.idList,
        // completada = archivada en Trello O en lista de "terminado"
        completada: c.dueComplete === true || completadaPorLista
      };
    });

    return {
      cards,
      lists: listsRes.data
    };

  } catch (error) {
    console.error("Error Trello:", error.message);
    return { cards: [], lists: [] };
  }
}