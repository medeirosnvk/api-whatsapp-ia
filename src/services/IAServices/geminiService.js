const axios = require("axios");
const inicitalSystemPrompt = require("./geminiInitialPrompt");
const { getListaCredores, getOfertasCredor } = require("../../utils/requests");
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

async function sendToGemini(userMessage, context = []) {
  const documento = extractCpfCnpjFromText(userMessage);
  let externalData = null;
  let devedorSelecionado = null;

  if (documento) {
    try {
      externalData = await getListaCredores(documento);
      context.push({
        role: "user",
        parts: [
          {
            text: `Dados encontrados na API:\n${JSON.stringify(externalData)}`,
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

  if (externalData?.length > 1) {
    const match = userMessage.match(/\b[1-9][0-9]?\b/); // pega números de 1 a 99
    if (match) {
      const index = parseInt(match[0], 10) - 1;
      if (externalData[index]) {
        devedorSelecionado = externalData[index];
        const ofertas = await getOfertasCredor(devedorSelecionado.iddevedor);

        context.push({
          role: "user",
          parts: [
            {
              text: `Ofertas para o devedor ${
                devedorSelecionado.nome
              }:\n${JSON.stringify(ofertas)}`,
            },
          ],
        });
      }
    }
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
      api: !!documento && !!externalData,
      intent: documento ? "dados_cliente" : null,
      params: documento ? { documento, dados: externalData } : null,
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
