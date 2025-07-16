/* eslint-disable indent */
/* eslint-disable no-unused-vars */
const redisClient = require("../config/cache/redisClient"); // importa seu cliente Redis

const SESSION_PREFIX = "wa-session:";

// Utilitário para obter o horário do servidor com fuso horário
const getServerDateTime = (timezone = "America/Sao_Paulo") => {
  return new Date().toLocaleString("en-US", { timeZone: timezone });
};

module.exports = {
  /**
   * Adiciona uma nova sessão ao Redis.
   * @param {string} sessionName
   * @param {object} client
   * @param {object} additionalData
   */
  addSession: async (sessionName, client, additionalData = {}) => {
    const sessionData = {
      connectionState: "connecting",
      connectionDateTime: getServerDateTime(),
      ...additionalData,
    };

    // salva `client` separadamente na memória se necessário (evita serializar funções)
    sessionData._clientStoredSeparately = true;

    await redisClient.set(
      SESSION_PREFIX + sessionName,
      JSON.stringify(sessionData)
    );

    // armazena o client apenas em memória local (caso queira)
    redisClient.clients = redisClient.clients || {};
    redisClient.clients[sessionName] = client;
  },

  /**
   * Retorna os dados da sessão.
   * @param {string} sessionName
   * @returns {object|null}
   */
  getSession: async (sessionName) => {
    const data = await redisClient.get(SESSION_PREFIX + sessionName);
    if (!data) {
      console.error(`Sessão "${sessionName}" não encontrada.`);
      return null;
    }

    const session = JSON.parse(data);

    // restaura client da memória se armazenado
    if (session._clientStoredSeparately && redisClient.clients) {
      session.client = redisClient.clients[sessionName];
    }

    return session;
  },

  /**
   * Lista todas as sessões armazenadas no Redis.
   */
  getAllSessions: async () => {
    const keys = await redisClient.keys(SESSION_PREFIX + "*");
    const sessions = [];

    for (const key of keys) {
      const sessionName = key.replace(SESSION_PREFIX, "");
      const data = await redisClient.get(key);
      const session = JSON.parse(data);

      const client = redisClient.clients?.[sessionName];
      const clientInfo = client?.info
        ? {
            pushname: client.info.pushname,
            wid: client.info.wid,
          }
        : null;

      sessions.push({
        sessionName,
        connectionState: session.connectionState,
        info: clientInfo,
        connectionDateTime: session.connectionDateTime,
      });
    }

    return sessions;
  },

  /**
   * Atualiza uma sessão existente no Redis.
   * @param {string} sessionName
   * @param {object} updates
   */
  updateSession: async (sessionName, updates) => {
    console.log("Atualizando sessão:", sessionName);

    const currentData = await module.exports.getSession(sessionName);
    if (!currentData) {
      throw new Error(`Sessão "${sessionName}" não encontrada.`);
    }

    if (updates.client) {
      if (redisClient.clients?.[sessionName] !== updates.client) {
        redisClient.clients[sessionName] = updates.client;
      } else {
        console.warn(
          `O objeto \`client\` para a sessão "${sessionName}" já está atualizado.`
        );
      }
      delete updates.client;
    }

    const updatedData = {
      ...currentData,
      ...updates,
      connectionDateTime: getServerDateTime(),
    };

    await redisClient.set(
      SESSION_PREFIX + sessionName,
      JSON.stringify(updatedData)
    );
  },

  /**
   * Remove uma sessão do Redis.
   * @param {string} sessionName
   */
  removeSession: async (sessionName) => {
    const exists = await redisClient.exists(SESSION_PREFIX + sessionName);
    if (!exists) {
      console.warn(
        `Tentativa de remover sessão inexistente: "${sessionName}".`
      );
      return;
    }

    await redisClient.del(SESSION_PREFIX + sessionName);
    if (redisClient.clients) {
      delete redisClient.clients[sessionName];
    }
  },
};
