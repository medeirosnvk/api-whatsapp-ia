const axios = require("axios");
const inicitalSystemPrompt = require("./geminiInitialPrompt");
const getListaCredores = require("../../utils/requests");
const apiKeyGemini = process.env.GEMINI_API_KEY;

function formatCpfCnpj(text) {
  const cleaned = text.replace(/\D/g, "");
  if (cleaned.length === 11 || cleaned.length === 14) {
    return cleaned;
  }
  return null;
}

async function sendToGemini(userMessage, context = []) {
  const documento = formatCpfCnpj(userMessage);
  let externalData = null;

  if (documento) {
    try {
      externalData = await getListaCredores(documento);
      console.log("Dados encontrados na API:", externalData);

      context.push({
        role: "user",
        parts: [`Dados encontrados na API:\n${JSON.stringify(externalData)}`],
      });
    } catch (error) {
      console.error("Erro ao buscar dados da API:", error.message);

      context.push({
        role: "user",
        parts: [`Não foi possível buscar os dados do CPF/CNPJ informado.`],
      });
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
