const axios = require("axios");
const inicitalSystemPrompt = require("./geminiInitialPrompt");
const { getListaCredores, getOfertasCredor } = require("../../utils/requests");
const verificarIntencao = require("./verifyIntention");
const apiKeyGemini = process.env.GEMINI_API_KEY;

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

function extractNumberFromText(text) {
  const matches = text.match(/\b[1-9][0-9]?\b/);
  if (!matches) return null;

  for (const match of matches) {
    if (!isNaN(match)) {
      return match;
    }
  }

  return null;
}

const data = { listaCredores: [], credorSelecionado: [], ofertas: [] };

async function sendToGemini(userMessage, context = []) {
  let iddevedor;
  const documento = extractCpfCnpjFromText(userMessage);
  const match = extractNumberFromText(userMessage);

  if (documento) {
    console.log("ENTROU EM DOCUMENTO");

    try {
      data.listaCredores = await getListaCredores(documento);
      console.log("data.listaCredores -", data.listaCredores);

      context.push({
        role: "user",
        parts: [
          {
            text: `Dados encontrados na API:\n${JSON.stringify(
              data.listaCredores
            )}`,
          },
        ],
      });
    } catch (error) {
      console.error("Erro ao buscar dados da API:", error.message);
      context.push({
        role: "user",
        parts: [
          { text: `Não foi possível buscar os dados do CPF/CNPJ informado.` },
        ],
      });
    }
  }

  if (match) {
    console.log("ENTROU EM MATH");
    const index = parseInt(match[0], 10) - 1;
    console.log("index -", index);
    console.log("data.listaCredores -", data.listaCredores);
    let devedor;

    if (!isNaN(index) && index >= 0 && index < data.listaCredores.length) {
      devedor = data.listaCredores[index];
      console.log("Devedor selecionado:", devedor);
    } else {
      console.log("Índice inválido. Nenhum devedor correspondente.");
    }

    if (devedor) {
      data.credorSelecionado = devedor;
      iddevedor = data.credorSelecionado.iddevedor;
      console.log("data.credorSelecionado -", data.credorSelecionado);

      const ofertas = await getOfertasCredor(data.credorSelecionado.iddevedor);
      data.ofertas = ofertas;
      console.log("ofertas -", data.ofertas);

      context.push({
        role: "user",
        parts: [
          {
            text: `Ofertas disponiveis para o credor selecionado ${
              data.credorSelecionado.nome
            } e iddevedor ${
              data.credorSelecionado.iddevedor
            }:\n${JSON.stringify(ofertas)}`,
          },
        ],
      });
    } else {
      context.push({
        role: "user",
        parts: [{ text: "Número inválido. Escolha um devedor válido." }],
      });
    }
  }

  if (
    userMessage.match(/(quero|desejo|gostaria).*?(negociar|parcelar|resolver)/i)
  ) {
    return {
      message:
        "Ótimo! Para iniciarmos a negociação, por favor, envie seu CPF ou CNPJ.",
      context,
    };
  }

  const payload = {
    contents: [
      {
        role: "user",
        parts: [{ text: inicitalSystemPrompt }],
      },
      ...context,
      {
        role: "user",
        parts: [{ text: userMessage }],
      },
    ],
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

    return {
      message: text,
      context,
      api: !!documento && !!data.listaCredores,
      intent: documento ? "dados_cliente" : null,
      params: documento ? { documento, dados: data.listaCredores } : null,
    };
  } catch (err) {
    console.error("Erro ao enviar mensagem para Gemini:", err.message);
    return {
      message:
        "Houve um erro ao processar sua solicitação. Tente novamente mais tarde.",
      context,
    };
  }
}

module.exports = { sendToGemini };
