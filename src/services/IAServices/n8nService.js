const axios = require("axios");

async function handleN8NAction(intent, params) {
  try {
    const { data } = await axios.get(
      `${process.env.N8N_WEBHOOK_URL}/${intent}`,
      params
    );
    return {
      success: true,
      message: data?.resposta || "Dados retornados com sucesso.",
    };
  } catch (err) {
    console.error(err);
    return { success: false, message: "Erro ao buscar dados do n8n." };
  }
}

module.exports = {
  handleN8NAction,
};
