// src/trello.js
import axios from "axios";
import { config } from "./config.js";

export async function getBoardData() {
  try {
    const [cardsRes, listsRes, membersRes] = await Promise.all([
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
      }),
      axios.get(`https://api.trello.com/1/boards/${config.boardId}/members`, {
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

    const memberMap = {};
    membersRes.data.forEach(m => { memberMap[m.id] = m.username.toLowerCase(); });

    const cards = cardsRes.data.map(c => {
      const listName = (listMap[c.idList] || "").toLowerCase();
      const completadaPorLista = completedListNames.some(n => listName.includes(n));
      const memberUsernames = c.idMembers.map(id => memberMap[id]).filter(Boolean);
      
      return {
        id: c.id,
        nombre: c.name,
        fecha: c.due,
        descripcion: c.desc,
        miembros: c.idMembers,
        memberUsernames: memberUsernames, // Nuevos usernames legibles (ej: "davidgiler")
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

/**
 * Crear una nueva tarjeta en una lista específica.
 */
export async function createCard(listId, name, desc = "") {
  try {
    const res = await axios.post("https://api.trello.com/1/cards", null, {
      params: {
        key: config.key,
        token: config.token,
        idList: listId,
        name,
        desc
      }
    });
    return res.data;
  } catch (error) {
    console.error("[Trello] Error al crear tarjeta:", error.response?.data || error.message);
    return null;
  }
}

/**
 * Mover una tarjeta a otra lista.
 */
export async function moveCard(cardId, listId) {
  try {
    const res = await axios.put(`https://api.trello.com/1/cards/${cardId}`, null, {
      params: {
        key: config.key,
        token: config.token,
        idList: listId
      }
    });
    return res.data;
  } catch (error) {
    console.error(`[Trello] Error al mover tarjeta ${cardId}:`, error.response?.data || error.message);
    return null;
  }
}

/**
 * Añadir un comentario a una tarjeta existente.
 */
export async function addCommentToCard(cardId, text) {
  try {
    const res = await axios.post(`https://api.trello.com/1/cards/${cardId}/actions/comments`, null, {
      params: {
        key: config.key,
        token: config.token,
        text
      }
    });
    return res.data;
  } catch (error) {
    console.error(`[Trello] Error al comentar en tarjeta ${cardId}:`, error.response?.data || error.message);
    return null;
  }
}