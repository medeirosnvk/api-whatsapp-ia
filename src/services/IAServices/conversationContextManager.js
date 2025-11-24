/**
 * Gerenciador de contexto de conversa por usuário
 * Mantém o estado e histórico de cada conversa individual
 */

const conversationContexts = new Map();

// Estados do fluxo de atendimento
const FLOW_STATES = {
  INICIAL: "inicial",
  AGUARDANDO_DOCUMENTO: "aguardando_documento",
  AGUARDANDO_SELECAO_CREDOR: "aguardando_selecao_credor",
  AGUARDANDO_SELECAO_PLANO: "aguardando_selecao_plano",
  AGUARDANDO_FECHAMENTO_ACORDO: "aguardando_fechamento_acordo",
  FINALIZADO: "finalizado",
};

/**
 * Obtém ou cria o contexto de conversa de um usuário
 * @param {string} userId - ID do usuário (ex: 555192261797@c.us)
 * @returns {object} - Contexto da conversa
 */
function getOrCreateContext(userId) {
  if (!conversationContexts.has(userId)) {
    conversationContexts.set(userId, {
      userId,
      state: FLOW_STATES.INICIAL,
      context: [], // Histórico de mensagens para o Gemini
      data: {
        listaCredores: [],
        credorSelecionado: null,
        ofertas: [],
        documento: null,
      },
      flags: {
        saudacaoEnviada: false,
        promptInicialEnviado: false,
      },
      createdAt: new Date().toISOString(),
      lastInteraction: new Date().toISOString(),
    });
  }
  return conversationContexts.get(userId);
}

/**
 * Atualiza o contexto de um usuário
 * @param {string} userId - ID do usuário
 * @param {object} updates - Atualizações a serem aplicadas
 */
function updateContext(userId, updates) {
  const context = getOrCreateContext(userId);
  Object.assign(context, updates);
  context.lastInteraction = new Date().toISOString();
  conversationContexts.set(userId, context);
  return context;
}

/**
 * Adiciona uma mensagem ao histórico de contexto
 * @param {string} userId - ID do usuário
 * @param {string} role - 'user' ou 'model'
 * @param {string} text - Texto da mensagem
 */
function addToContext(userId, role, text) {
  const context = getOrCreateContext(userId);
  context.context.push({
    role,
    parts: [{ text }],
  });
  context.lastInteraction = new Date().toISOString();
  conversationContexts.set(userId, context);
}

/**
 * Limpa o contexto de um usuário (útil para resetar conversa)
 * @param {string} userId - ID do usuário
 */
function clearContext(userId) {
  conversationContexts.delete(userId);
}

/**
 * Remove contextos antigos (útil para limpeza de memória)
 * @param {number} maxAgeHours - Idade máxima em horas (padrão: 24)
 */
function cleanupOldContexts(maxAgeHours = 24) {
  const now = new Date();
  const maxAge = maxAgeHours * 60 * 60 * 1000;

  for (const [userId, context] of conversationContexts.entries()) {
    const lastInteraction = new Date(context.lastInteraction);
    const age = now - lastInteraction;

    if (age > maxAge) {
      conversationContexts.delete(userId);
      console.log(`Contexto removido para usuário ${userId} (inativo há ${Math.round(age / (60 * 60 * 1000))} horas)`);
    }
  }
}

/**
 * Obtém o estado atual do fluxo de um usuário
 * @param {string} userId - ID do usuário
 * @returns {string} - Estado atual
 */
function getState(userId) {
  const context = getOrCreateContext(userId);
  return context.state;
}

/**
 * Define o estado do fluxo de um usuário
 * @param {string} userId - ID do usuário
 * @param {string} state - Novo estado
 */
function setState(userId, state) {
  updateContext(userId, { state });
}

module.exports = {
  getOrCreateContext,
  updateContext,
  addToContext,
  clearContext,
  cleanupOldContexts,
  getState,
  setState,
  FLOW_STATES,
};

