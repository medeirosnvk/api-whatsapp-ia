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
  if (!text) return null;
  const cleaned = text.trim();
  // Tenta encontrar um número inteiro no início da mensagem ou isolado
  const matches = cleaned.match(/^\d+|\s(\d+)$|^(\d+)\s/);
  if (!matches) return null;

  // Extrai o número capturado
  const num = parseInt(matches[0].trim() || matches[1] || matches[2], 10);
  if (!isNaN(num) && num > 0) {
    return num;
  }

  return null;
}

/**
 * Tenta identificar o índice de um credor a partir do iddevedor informado na mensagem
 * @param {string} text
 * @param {Array} listaCredores
 * @returns {number} - índice 0-based ou -1 quando não encontrado
 */
function findCredorIndexById(text, listaCredores = []) {
  if (!text || !Array.isArray(listaCredores) || listaCredores.length === 0) {
    return -1;
  }

  const numericTokens = text.match(/\d+/g);
  if (!numericTokens) return -1;

  for (const token of numericTokens) {
    const index = listaCredores.findIndex(
      (credor) => credor?.iddevedor && String(credor.iddevedor) === token
    );
    if (index !== -1) {
      return index;
    }
  }

  return -1;
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

/**
 * Monta instruções internas de condução conforme o estado atual
 * @param {string} state - Estado atual do fluxo
 * @param {object} data - Dados disponíveis no contexto
 * @returns {string} - Diretriz textual
 */
function summarizeCredores(lista = []) {
  if (!Array.isArray(lista) || lista.length === 0) return "";
  return lista
    .map(
      (credor, index) =>
        `${index + 1}-Nome: ${credor.nome || "Credor"} | ID: ${
          credor.iddevedor || "Indisponível"
        }`
    )
    .slice(0, 5)
    .join(", ");
}

function summarizePlanos(ofertas = []) {
  if (!Array.isArray(ofertas) || ofertas.length === 0) return "";
  return ofertas
    .map((oferta, index) => {
      const nome =
        oferta?.nome ||
        oferta?.titulo ||
        oferta?.descricao ||
        `Plano ${index + 1}`;
      const parcelas =
        oferta?.quantidadeParcelas ||
        oferta?.parcelas ||
        oferta?.qtdParcelas ||
        oferta?.numeroParcelas;
      const valor =
        oferta?.valorTotal ||
        oferta?.valor ||
        oferta?.valor_original ||
        oferta?.saldo;
      const detalhes = [];
      if (parcelas) detalhes.push(`${parcelas}x`);
      if (valor) detalhes.push(`R$ ${valor}`);
      return `${index + 1}-${nome}${
        detalhes.length ? ` (${detalhes.join(" · ")})` : ""
      }`;
    })
    .slice(0, 5)
    .join(", ");
}

function buildFlowDirective(state, data = {}) {
  const base =
    "Conduza a conversa de forma natural, acolhedora e humana, sem mencionar que existe um fluxo ou etapas internas. Evite listas numeradas sempre que possível. Use somente os dados recebidos nas APIs/contexto e deixe claro quando algo ainda não estiver disponível.";

  switch (state) {
    case FLOW_STATES.AGUARDANDO_DOCUMENTO:
      return `${base} incentive o cliente a compartilhar CPF ou CNPJ de maneira gentil e contextualizada.`;
    case FLOW_STATES.AGUARDANDO_SELECAO_CREDOR:
      return `${base} apresente as dívidas em aberto e ajude o cliente a escolher qual deseja resolver agora. Utilize como referência os credores: ${summarizeCredores(
        data.listaCredores
      )}.`;
    case FLOW_STATES.AGUARDANDO_SELECAO_PLANO:
      return `${base} descreva os planos disponíveis para o credor selecionado ${
        data.credorSelecionado?.nome || ""
      } e estimule a escolha do que fizer mais sentido. Planos disponíveis: ${summarizePlanos(
        data.ofertas
      )}.`;
    case FLOW_STATES.AGUARDANDO_FECHAMENTO_ACORDO:
      return `${base} confirme o plano escolhido e informe que o acordo está em preparação, convidando o cliente a aguardar enquanto finaliza os detalhes.`;
    default:
      return `${base} esteja pronta para identificar intenções de negociação e oferecer ajuda proativa.`;
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
    const credoresApiResponse = await getListaCredores(documento);
    const listaCredores = (credoresApiResponse || []).map((credor = {}) => ({
      nome: credor.nome || credor.empresa || "Credor",
      empresa: credor.empresa || credor.nome || "Empresa",
      iddevedor: credor.iddevedor,
    }));
    console.log("listaCredores -", listaCredores);

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

    // Adiciona resumo filtrado ao contexto da conversa (sem valores/saldos)
    const credoresInfo = listaCredores
      .map(
        (credor, index) =>
          `${index + 1}. Nome: ${credor.nome || "Credor"} | Empresa: ${
            credor.empresa || credor.nome || "Empresa"
          } | ID: ${credor.iddevedor || "Indisponível"}`
      )
      .join("\n");

    addToContext(
      userId,
      "user",
      `Empresas disponíveis para negociação (documento ${documento}):\n${credoresInfo}\n\nEnvie o número da lista ou o ID informado para escolher com quem negociar primeiro.`
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
    console.log("ofertas -", ofertas);

    // Valida se ofertas está vazio
    if (!ofertas || ofertas.length === 0) {
      addToContext(
        userId,
        "user",
        `Desculpe, não há ofertas disponíveis no momento para o credor "${credorSelecionado.nome}". Tente novamente mais tarde ou escolha outro credor.`
      );
      setState(userId, FLOW_STATES.AGUARDANDO_SELECAO_CREDOR);
      return { success: false, message: "Nenhuma oferta disponível." };
    }

    // Atualiza o contexto
    updateContext(userId, {
      data: {
        ...context.data,
        credorSelecionado,
        ofertas,
        planoSelecionado: null,
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

/**
 * Processa a seleção de plano e atualiza estado para fechamento do acordo
 * @param {string} userId - ID do usuário
 * @param {number} selectedIndex - Índice do plano selecionado (1-based)
 * @returns {Promise<object>} - Resultado do processamento
 */
async function processPlanoSelection(userId, selectedIndex) {
  const context = getOrCreateContext(userId);
  const index = selectedIndex - 1;

  if (!context.data.ofertas || context.data.ofertas.length === 0) {
    addToContext(
      userId,
      "user",
      "Ainda não tenho ofertas para apresentar. Consulte as dívidas primeiro."
    );
    return { success: false, message: "Nenhuma oferta disponível." };
  }

  if (index < 0 || index >= context.data.ofertas.length) {
    addToContext(
      userId,
      "user",
      `Número inválido. Escolha um plano entre 1 e ${context.data.ofertas.length}.`
    );
    return { success: false, message: "Índice de plano inválido." };
  }

  const planoSelecionado = context.data.ofertas[index];

  updateContext(userId, {
    data: {
      ...context.data,
      planoSelecionado,
    },
  });

  addToContext(
    userId,
    "user",
    `Plano escolhido (${index + 1}): ${JSON.stringify(
      planoSelecionado,
      null,
      2
    )}`
  );

  setState(userId, FLOW_STATES.AGUARDANDO_FECHAMENTO_ACORDO);

  return { success: true, planoSelecionado };
}

/**
 * Processa o fechamento do acordo
 * @param {string} userId - ID do usuário
 * @returns {Promise<object>} - Resultado do processamento
 */
async function processAcordoFechamento(userId) {
  const context = getOrCreateContext(userId);

  if (
    !context.data.planoSelecionado ||
    !context.data.credorSelecionado ||
    !context.data.documento
  ) {
    addToContext(
      userId,
      "user",
      "Informações incompletas para finalizar o acordo. Por favor, comece novamente."
    );
    return { success: false, message: "Dados incompletos." };
  }

  try {
    console.log(`[${userId}] Iniciando fechamento do acordo...`);

    // Adiciona mensagem de aguardo ao contexto
    addToContext(
      userId,
      "user",
      "Finalizando o acordo, por favor aguarde... ⏳"
    );

    // Cria uma promise com timeout de 30 segundos
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              "Timeout ao processar acordo. A requisição excedeu 30 segundos. Tente novamente."
            )
          ),
        30000
      )
    );

    console.log(
      "DADOS ACORDO MASTER -",
      userId,
      context.data.planoSelecionado.plano
    );

    // Executa a API de registro com tratamento de timeout
    const acordoResponse = await Promise.race([
      postAcordoMaster(userId, context.data.planoSelecionado.plano),
      timeoutPromise,
    ]);

    console.log(`[${userId}] Resposta da API:`, acordoResponse);

    // Formata a resposta da API para apresentar ao usuário
    const mensagemSucesso = formatarRespostaAcordo(acordoResponse);

    // Adiciona a resposta formatada ao contexto
    addToContext(userId, "user", mensagemSucesso);

    // Atualiza o contexto com os dados do acordo finalizado
    updateContext(userId, {
      data: {
        ...context.data,
        acordoFinalizado: acordoResponse,
      },
    });

    setState(userId, FLOW_STATES.FINALIZADO);

    return {
      success: true,
      acordo: {
        documento: context.data.documento,
        credor: context.data.credorSelecionado,
        plano: context.data.planoSelecionado,
        resposta: acordoResponse,
      },
    };
  } catch (error) {
    console.error(`[${userId}] Erro ao fechar acordo:`, error.message);

    addToContext(
      userId,
      "user",
      `Desculpe, ocorreu um erro ao finalizar o acordo: ${error.message}. Por favor, tente novamente.`
    );

    return {
      success: false,
      message: `Erro ao processar acordo: ${error.message}`,
    };
  }
}

/**
 * Formata a resposta do API de registro do acordo para exibição ao usuário
 * @param {object} acordoData - Dados retornados pela API
 * @returns {string} - Mensagem formatada
 */
function formatarRespostaAcordo(acordoData) {
  if (!acordoData) {
    return "Acordo finalizado com sucesso!";
  }

  let mensagem = "✅ Acordo Finalizado com Sucesso!\n\n";

  // Dados da Primeira Etapa (Informações principais do acordo)
  if (acordoData.primeiraEtapaResponse) {
    const primeira = acordoData.primeiraEtapaResponse;

    if (primeira.iddevedor) {
      mensagem += `ID Devedor: ${primeira.iddevedor}\n`;
    }

    if (primeira.idcredor) {
      mensagem += `ID Credor: ${primeira.idcredor}\n`;
    }

    if (primeira.plano) {
      mensagem += `Plano Selecionado: ${primeira.plano}\n`;
    }

    if (primeira.total_geral) {
      mensagem += `Valor Total: R$ ${primeira.total_geral
        .toFixed(2)
        .replace(".", ",")}\n`;
    }

    if (primeira.valor_parcela) {
      mensagem += `Valor da Parcela: R$ ${primeira.valor_parcela.replace(
        ".",
        ","
      )}\n`;
    }

    if (primeira.ultimaDataVencimento) {
      mensagem += `Última Data de Vencimento: ${formatarData(
        primeira.ultimaDataVencimento
      )}\n`;
    }

    // Detalha as parcelas se disponíveis
    if (
      primeira.vencimentosParcelas &&
      Array.isArray(primeira.vencimentosParcelas)
    ) {
      mensagem += `\nDetalhes das Parcelas:\n`;
      primeira.vencimentosParcelas.forEach((parcela, index) => {
        mensagem += `  Parcela ${
          index + 1
        }: R$ ${parcela.valorParcelaAtual.replace(
          ".",
          ","
        )} - Vencimento: ${formatarData(parcela.vencimento)}\n`;
      });
    }
  }

  // Dados da Terceira Etapa (Boleto e PIX)
  if (acordoData.terceiraEtapaResponse) {
    const terceira = acordoData.terceiraEtapaResponse;
    mensagem += `\n`;

    if (terceira.pixCopiaECola) {
      mensagem += `🔐 PIX Copia e Cola:\n${terceira.pixCopiaECola}\n\n`;
    }

    if (terceira.urlBoleto) {
      mensagem += `📄 Link do Boleto:\n${terceira.urlBoleto}\n\n`;
    }

    if (terceira.urlQrCode) {
      mensagem += `📱 QR Code PIX:\n${terceira.urlQrCode}\n`;
    }
  }

  // Fallback para campos legados (compatibilidade com APIs antigas)
  if (!acordoData.primeiraEtapaResponse && !acordoData.terceiraEtapaResponse) {
    if (acordoData.id || acordoData.ID) {
      mensagem += `ID do Acordo: ${acordoData.id || acordoData.ID}\n`;
    }

    if (acordoData.numero_acordo || acordoData.numeroAcordo) {
      mensagem += `Número do Acordo: ${
        acordoData.numero_acordo || acordoData.numeroAcordo
      }\n`;
    }

    if (acordoData.status) {
      mensagem += `Status: ${acordoData.status}\n`;
    }

    if (acordoData.data_criacao || acordoData.dataCriacao) {
      mensagem += `Data de Criação: ${
        acordoData.data_criacao || acordoData.dataCriacao
      }\n`;
    }

    if (acordoData.valor_total || acordoData.valorTotal) {
      mensagem += `Valor Total: R$ ${
        acordoData.valor_total || acordoData.valorTotal
      }\n`;
    }
  }

  mensagem +=
    "\n🎉 Seu acordo foi registrado com sucesso! Acompanhe as datas das parcelas.";

  return mensagem;
}

/**
 * Formata uma data no formato YYYY-MM-DD para DD/MM/YYYY
 * @param {string} data - Data em formato YYYY-MM-DD
 * @returns {string} - Data formatada em DD/MM/YYYY
 */
function formatarData(data) {
  if (!data) return "";
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Envia mensagem para o Gemini e retorna resposta
 * @param {string} userId - ID do usuário
 * @param {string} userMessage - Mensagem do usuário
 * @returns {Promise<object>} - Resposta do Gemini
 */
async function sendToGemini(userId, userMessage) {
  const context = getOrCreateContext(userId);
  let currentState = getState(userId);

  console.log(`[${userId}] Estado atual: ${currentState}`);
  console.log(`[${userId}] Mensagem recebida: ${userMessage}`);

  // Se é o primeiro contato, move para aguardando documento
  if (currentState === FLOW_STATES.INICIAL) {
    setState(userId, FLOW_STATES.AGUARDANDO_DOCUMENTO);
    currentState = FLOW_STATES.AGUARDANDO_DOCUMENTO;
  }

  // Processa documento se detectado (aceita em qualquer estado se ainda não foi processado)
  const documento = extractCpfCnpjFromText(userMessage);
  if (documento) {
    const updatedContext = getOrCreateContext(userId);
    // Se ainda não tem documento processado ou está aguardando documento
    if (
      !updatedContext.data.documento ||
      currentState === FLOW_STATES.AGUARDANDO_DOCUMENTO
    ) {
      await processDocument(userId, documento);
      currentState = getState(userId);
    }
  }

  const selectedNumber = extractNumberFromText(userMessage);
  const listaCredores = context.data?.listaCredores || [];
  const credorIndexFromId =
    currentState === FLOW_STATES.AGUARDANDO_SELECAO_CREDOR
      ? findCredorIndexById(userMessage, listaCredores)
      : -1;

  // Processa seleção de credor por ID (iddevedor) - prioridade 1
  if (
    credorIndexFromId >= 0 &&
    currentState === FLOW_STATES.AGUARDANDO_SELECAO_CREDOR
  ) {
    console.log(
      `[${userId}] Selecionando credor por ID: índice ${credorIndexFromId}`
    );
    await processCredorSelection(userId, credorIndexFromId + 1);
    currentState = getState(userId);
  }
  // Processa seleção de credor por número da lista - prioridade 2
  else if (
    selectedNumber &&
    currentState === FLOW_STATES.AGUARDANDO_SELECAO_CREDOR
  ) {
    console.log(
      `[${userId}] Selecionando credor por número: ${selectedNumber}`
    );
    await processCredorSelection(userId, selectedNumber);
    currentState = getState(userId);
  }
  // Processa seleção de plano por número
  else if (
    selectedNumber &&
    currentState === FLOW_STATES.AGUARDANDO_SELECAO_PLANO
  ) {
    console.log(`[${userId}] Selecionando plano: ${selectedNumber}`);
    await processPlanoSelection(userId, selectedNumber);
    currentState = getState(userId);
  }
  // Processa fechamento de acordo
  else if (currentState === FLOW_STATES.AGUARDANDO_FECHAMENTO_ACORDO) {
    console.log(`[${userId}] Processando fechamento do acordo...`);
    await processAcordoFechamento(userId);
    currentState = getState(userId);
  }

  // Atualiza contexto após processamentos
  const updatedContext = getOrCreateContext(userId);
  currentState = getState(userId);

  // Adiciona a mensagem do usuário ao contexto
  // (o processamento de documento/credor adiciona informações adicionais, mas a mensagem original também é importante)
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

  // Adiciona instruções internas do estado atual para orientar a resposta natural
  const flowDirective = buildFlowDirective(currentState, updatedContext.data);
  if (flowDirective) {
    contents.push({
      role: "user",
      parts: [{ text: flowDirective }],
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
    console.error(
      `[${userId}] Erro ao enviar mensagem para Gemini:`,
      err.message
    );
    return {
      message:
        "Houve um erro ao processar sua solicitação. Tente novamente mais tarde.",
      state: getState(userId),
    };
  }
}

module.exports = { sendToGemini, processAcordoFechamento };
