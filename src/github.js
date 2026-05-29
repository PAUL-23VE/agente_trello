// src/github.js
import axios from "axios";
import { config } from "./config.js";

const getGithubApi = (repoName) => {
  if (!config.githubToken) {
    throw new Error("Credenciales de GitHub no configuradas (GITHUB_TOKEN falta en .env).");
  }
  return axios.create({
    baseURL: `https://api.github.com/repos/${repoName}`,
    headers: {
      "Authorization": `token ${config.githubToken}`,
      "Accept": "application/vnd.github.v3+json"
    }
  });
};

/**
 * Obtener todos los Pull Requests abiertos de todos los repositorios configurados.
 */
export async function getOpenPRs() {
  try {
    let allPRs = [];
    for (const repo of config.githubRepos) {
      try {
        const api = getGithubApi(repo);
        const res = await api.get("/pulls", {
          params: { state: "open" }
        });
        // Agregar el nombre del repo a cada PR para saber de dónde viene
        const prsWithRepo = res.data.map(pr => ({ ...pr, repository: repo }));
        allPRs = allPRs.concat(prsWithRepo);
      } catch (err) {
        console.error(`[GitHub] Error al obtener PRs de ${repo}:`, err.response?.data || err.message);
      }
    }
    return allPRs;
  } catch (error) {
    console.error("[GitHub] Error general al obtener PRs:", error.message);
    return [];
  }
}

/**
 * Obtener el código cambiado (diff) de un PR específico.
 */
export async function getPRDiff(repoName, prNumber) {
  try {
    const api = getGithubApi(repoName);
    const res = await api.get(`/pulls/${prNumber}`, {
      headers: {
        "Accept": "application/vnd.github.v3.diff"
      }
    });
    return res.data;
  } catch (error) {
    console.error(`[GitHub] Error al obtener Diff del PR #${prNumber} en ${repoName}:`, error.response?.data || error.message);
    return "";
  }
}

/**
 * Publicar un comentario de revisión en un PR de GitHub.
 */
export async function postReviewComment(repoName, prNumber, commentBody) {
  try {
    const api = getGithubApi(repoName);
    const res = await api.post(`/issues/${prNumber}/comments`, {
      body: commentBody
    });
    return res.data;
  } catch (error) {
    console.error(`[GitHub] Error al publicar comentario en PR #${prNumber} en ${repoName}:`, error.response?.data || error.message);
    return null;
  }
}
