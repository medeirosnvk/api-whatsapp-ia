/* eslint-disable indent */
/* eslint-disable no-unused-vars */
const redisClient = require("../config/cache/redisClient");

const SESSION_PREFIX = "wa-session:";

// Garante que redisClient.clients esteja inicializado
if (!redisClient.clients) {
  redisClient.clients = {};
}

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
      _clientStoredSeparately: true, // marca que client foi separado
    };

    await redisClient.set(
      SESSION_PREFIX + sessionName,
      JSON.stringify(sessionData)
    );

    // armazena o client em memória local
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

    // restaura client da memória
    if (session._clientStoredSeparately && redisClient.clients) {
      session.client = redisClient.clients[sessionName];
    }

    return session;
  },

  /**
   * Lista todas as sessões armazenadas no Redis.
   * @returns {Array}
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

    // Se estiver atualizando o client, armazena apenas em memória
    if (updates.client) {
      redisClient.clients[sessionName] = updates.client;
      delete updates.client;
    }

    const updatedData = {
      ...currentData,
      ...updates,
      connectionDateTime: getServerDateTime(),
      _clientStoredSeparately: true,
    };

    // Protege contra erro de estrutura circular
    let safeData;
    try {
      safeData = JSON.stringify(updatedData);
    } catch (err) {
      console.error("Erro ao serializar sessão para o Redis:", err.message);
      const { client, ...rest } = updatedData;
      safeData = JSON.stringify(rest);
    }

    await redisClient.set(SESSION_PREFIX + sessionName, safeData);
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
    delete redisClient.clients[sessionName];
  },
};
