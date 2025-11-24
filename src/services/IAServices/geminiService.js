const axios = require("axios");
const initialSystemPrompt = require("./geminiInitialPrompt");
const {
  getListaCredores,
  getOfertasCredor,
  postAcordoMaster,
} = require("../../utils/requests");
const {
  getOrCreateContext,
  updateContext,
  addToContext,
  setState,
  getState,
  FLOW_STATES,
} = require("./conversationContextManager");
const apiKeyGemini = process.env.GEMINI_API_KEY;

/**
 * Extrai CPF ou CNPJ do texto
 * @param {string} text - Texto para extrair documento
 * @returns {string|null} - CPF/CNPJ encontrado ou null
 */
function extractCpfCnpjFromText(text) {
  const matches = text.match(/\d{11}|\d{14}/g);
  if (!matches) return null;

  for (const match of matches) {
    if (match.length === 11 || match.length === 14) {
      return match;
    }
  }

  return null;
}

/**
 * Extrai número de seleção do texto
 * @param {string} text - Texto para extrair número
 * @returns {number|null} - Número encontrado ou null
 */
function extractNumberFromText(text) {
  const matches = text.match(/\b[1-9][0-9]?\b/);
  if (!matches) return null;

  for (const match of matches) {
    const num = parseInt(match, 10);
    if (!isNaN(num) && num > 0) {
      return num;
    }
  }

  return null;
}

/**
 * Detecta intenção de iniciar negociação
 * @param {string} message - Mensagem do usuário
 * @returns {boolean} - True se detectar intenção de negociar
 */
function detectNegotiationIntent(message) {
  return /(quero|desejo|gostaria|preciso|vou).*?(negociar|parcelar|resolver|pagar|quitar)/i.test(
    message
  );
}

function limitMessageSize(text, limit = 300) {
  if (!text) return text;
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}

function formatResponseData(data) {
  if (data === null || data === undefined) return "sem detalhes adicionais.";
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    return String(data);
  }

  if (Array.isArray(data)) {
    return data
      .map((item, index) => `${index + 1}) ${formatResponseData(item)}`)
      .join(" | ");
  }

  if (typeof data === "object") {
    const entries = Object.entries(data).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    );

    if (!entries.length) {
      return "retorno vazio.";
    }

    return entries
      .map(([key, value]) => {
        if (typeof value === "object") {
          return `${key}: ${JSON.stringify(value)}`;
        }
        return `${key}: ${value}`;
      })
      .join(" | ");
  }

  try {
    return JSON.stringify(data);
  } catch (error) {
    return "não foi possível formatar a resposta.";
  }
}

/**
 * Processa o documento recebido e busca credores
 * @param {string} userId - ID do usuário
 * @param {string} documento - CPF/CNPJ
 * @returns {Promise<object>} - Resultado da busca
 */
async function processDocument(userId, documento) {
  const context = getOrCreateContext(userId);

  try {
    console.log(`[${userId}] Buscando credores para documento: ${documento}`);
    const listaCredores = await getListaCredores(documento);

    if (!listaCredores || listaCredores.length === 0) {
      addToContext(
        userId,
        "user",
        "Nenhum débito encontrado para o documento informado."
      );
      return { success: false, message: "Nenhum débito encontrado." };
    }

    // Atualiza o contexto com os dados encontrados
    updateContext(userId, {
      data: {
        ...context.data,
        listaCredores,
        documento,
      },
    });

    // Adiciona os dados ao contexto da conversa
    const credoresInfo = listaCredores
      .map(
        (credor, index) =>
          `${index + 1}. ${credor.nome || "Credor sem nome"} - ID: ${credor.iddevedor}`
      )
      .join("\n");

    addToContext(
      userId,
      "user",
      `Dados encontrados na API para o documento ${documento}:\n${JSON.stringify(
        listaCredores,
        null,
        2
      )}\n\nLista formatada:\n${credoresInfo}`
    );

    setState(
      userId,
      listaCredores.length > 1
        ? FLOW_STATES.AGUARDANDO_SELECAO_CREDOR
        : FLOW_STATES.AGUARDANDO_SELECAO_PLANO
    );

    // Se houver apenas um credor, busca as ofertas automaticamente
    if (listaCredores.length === 1) {
      return await processCredorSelection(userId, 1);
    }

    return { success: true, listaCredores };
  } catch (error) {
    console.error(`[${userId}] Erro ao buscar dados da API:`, error.message);
    addToContext(
      userId,
      "user",
      "Não foi possível buscar os dados do CPF/CNPJ informado. Por favor, verifique o documento e tente novamente."
    );
    return { success: false, message: "Erro ao buscar dados." };
  }
}

/**
 * Processa a seleção de credor e busca ofertas
 * @param {string} userId - ID do usuário
 * @param {number} selectedIndex - Índice do credor selecionado (1-based)
 * @returns {Promise<object>} - Resultado do processamento
 */
async function processCredorSelection(userId, selectedIndex) {
  const context = getOrCreateContext(userId);
  const index = selectedIndex - 1;

  if (!context.data.listaCredores || context.data.listaCredores.length === 0) {
    addToContext(
      userId,
      "user",
      "Não há credores disponíveis. Por favor, envie seu CPF/CNPJ primeiro."
    );
    return { success: false, message: "Nenhum credor disponível." };
  }

  if (index < 0 || index >= context.data.listaCredores.length) {
    addToContext(
      userId,
      "user",
      `Número inválido. Escolha um número entre 1 e ${context.data.listaCredores.length}.`
    );
    return { success: false, message: "Índice inválido." };
  }

  const credorSelecionado = context.data.listaCredores[index];

  try {
    console.log(
      `[${userId}] Buscando ofertas para credor: ${credorSelecionado.nome} (ID: ${credorSelecionado.iddevedor})`
    );
    const ofertas = await getOfertasCredor(credorSelecionado.iddevedor);

    // Atualiza o contexto
    updateContext(userId, {
      data: {
        ...context.data,
        credorSelecionado,
        ofertas,
      },
    });

    // Adiciona as ofertas ao contexto
    const ofertasInfo = ofertas
      .map(
        (oferta, index) =>
          `Plano ${index + 1}: ${JSON.stringify(oferta, null, 2)}`
      )
      .join("\n\n");

    addToContext(
      userId,
      "user",
      `Ofertas disponíveis para o credor "${credorSelecionado.nome}" (ID: ${credorSelecionado.iddevedor}):\n\n${ofertasInfo}`
    );

    setState(userId, FLOW_STATES.AGUARDANDO_SELECAO_PLANO);

    return { success: true, credorSelecionado, ofertas };
  } catch (error) {
    console.error(`[${userId}] Erro ao buscar ofertas:`, error.message);
    addToContext(
      userId,
      "user",
      "Não foi possível buscar as ofertas para o credor selecionado."
    );
    return { success: false, message: "Erro ao buscar ofertas." };
  }
}

async function processPlanoSelection(userId, selectedIndex) {
  const context = getOrCreateContext(userId);
  const index = selectedIndex - 1;

  if (!context.data.ofertas || context.data.ofertas.length === 0) {
    const message =
      "Ainda não tenho planos disponíveis. Escolha primeiro qual credor deseja negociar.";
    addToContext(userId, "model", message);
    return { handled: true, message };
  }

  if (index < 0 || index >= context.data.ofertas.length) {
    const message = `Plano inválido. Informe um número entre 1 e ${context.data.ofertas.length}.`;
    addToContext(userId, "model", message);
    return { handled: true, message };
  }

  const planoSelecionado = context.data.ofertas[index];
  const { credorSelecionado } = context.data;

  if (!credorSelecionado?.iddevedor) {
    const message =
      "Não consegui localizar o credor selecionado. Envie o CPF/CNPJ novamente para reiniciar.";
    addToContext(userId, "model", message);
    return { handled: true, message };
  }

  try {
    addToContext(
      userId,
      "user",
      `Plano ${selectedIndex} escolhido para iddevedor ${credorSelecionado.iddevedor}. Dados: ${JSON.stringify(
        planoSelecionado
      )}`
    );

    const acordoResponse = await postAcordoMaster(
      credorSelecionado.iddevedor,
      planoSelecionado
    );

    updateContext(userId, {
      data: {
        ...context.data,
        planoSelecionado,
        acordoResponse,
      },
    });

    setState(userId, FLOW_STATES.FINALIZADO);

    const waitingMessage = `Perfeito! Estou fechando o plano ${selectedIndex}. Aguarde o fechamento do acordo.`;
    const formattedResponse = formatResponseData(acordoResponse);
    const finalMessage = limitMessageSize(
      `${waitingMessage} Retorno: ${formattedResponse}`
    );

    addToContext(userId, "model", finalMessage);

    return {
      handled: true,
      message: finalMessage,
    };
  } catch (error) {
    console.error(`[${userId}] Erro ao efetuar acordo:`, error.message);
    const errorMessage = limitMessageSize(
      "Houve um erro ao registrar o acordo. Já estou verificando, tente novamente em instantes."
    );
    addToContext(userId, "model", errorMessage);
    return {
      handled: true,
      message: errorMessage,
    };
  }
}

/**
 * Envia mensagem para o Gemini e retorna resposta
 * @param {string} userId - ID do usuário
 * @param {string} userMessage - Mensagem do usuário
 * @returns {Promise<object>} - Resposta do Gemini
 */
async function sendToGemini(userId, userMessage) {
  const context = getOrCreateContext(userId);
  const currentState = getState(userId);

  console.log(`[${userId}] Estado atual: ${currentState}`);
  console.log(`[${userId}] Mensagem recebida: ${userMessage}`);

  // Detecta intenção de negociação primeiro
  if (detectNegotiationIntent(userMessage) && currentState === FLOW_STATES.INICIAL) {
    setState(userId, FLOW_STATES.AGUARDANDO_DOCUMENTO);
  }

  // Processa documento se detectado (aceita em qualquer estado se ainda não foi processado)
  const documento = extractCpfCnpjFromText(userMessage);
  let documentoProcessado = false;
  if (documento) {
    const updatedContext = getOrCreateContext(userId);
    // Se ainda não tem documento processado ou está aguardando documento
    if (
      !updatedContext.data.documento ||
      currentState === FLOW_STATES.AGUARDANDO_DOCUMENTO ||
      currentState === FLOW_STATES.INICIAL
    ) {
      await processDocument(userId, documento);
      documentoProcessado = true;
    }
  }

  // Processa seleção de credor se detectada
  const selectedNumber = extractNumberFromText(userMessage);
  let credorProcessado = false;
  if (
    selectedNumber &&
    (currentState === FLOW_STATES.AGUARDANDO_SELECAO_CREDOR ||
      currentState === FLOW_STATES.AGUARDANDO_SELECAO_PLANO)
  ) {
    // Se está aguardando seleção de credor, processa a seleção
    if (currentState === FLOW_STATES.AGUARDANDO_SELECAO_CREDOR) {
      await processCredorSelection(userId, selectedNumber);
      credorProcessado = true;
    }
    // Se já está aguardando seleção de plano, processa o acordo
    if (currentState === FLOW_STATES.AGUARDANDO_SELECAO_PLANO && !credorProcessado) {
      const planoResult = await processPlanoSelection(userId, selectedNumber);
      if (planoResult?.handled) {
        return {
          message: planoResult.message,
          state: getState(userId),
        };
      }
    }
  }

  // Atualiza contexto após processamentos
  const updatedContext = getOrCreateContext(userId);

  // Adiciona a mensagem do usuário ao contexto
  addToContext(userId, "user", userMessage);

  // Monta o payload para o Gemini
  const contents = [];

  // Adiciona o prompt inicial apenas uma vez
  if (!updatedContext.flags.promptInicialEnviado) {
    contents.push({
      role: "user",
      parts: [{ text: initialSystemPrompt }],
    });
    updateContext(userId, {
      flags: { ...updatedContext.flags, promptInicialEnviado: true },
    });
  }

  // Adiciona o histórico de contexto
  contents.push(...updatedContext.context);

  const payload = {
    contents,
  };

  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKeyGemini}`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    const text =
      response.data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Desculpe, não consegui gerar uma resposta no momento.";

    // Adiciona a resposta do modelo ao contexto
    addToContext(userId, "model", text);

    // Marca saudação como enviada se ainda não foi
    if (!updatedContext.flags.saudacaoEnviada && text.length > 0) {
      updateContext(userId, {
        flags: { ...updatedContext.flags, saudacaoEnviada: true },
      });
    }

    return {
      message: text,
      state: getState(userId),
    };
  } catch (err) {
    console.error(`[${userId}] Erro ao enviar mensagem para Gemini:`, err.message);
    return {
      message:
        "Houve um erro ao processar sua solicitação. Tente novamente mais tarde.",
      state: getState(userId),
    };
  }
}

module.exports = { sendToGemini };
