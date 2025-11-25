const axios = require("axios");

const getListaCredores = async (documento) => {
  const url = `https://api.cobrance.online:3030/lista-credores?documento=${documento}`;

  const response = await axios.get(url);
  return response.data;
};

const getOfertasCredor = async (iddevedor) => {
  const url = `https://api.cobrance.online:3030/credores/oferta-parcelas?iddevedor=${iddevedor}`;

  const response = await axios.get(url);
  return response.data;
};

/**
 * Gera token de autenticação usando credenciais do .env
 * Espera que existam as variáveis: COBRANCE_USERNAME e COBRANCE_PASSWORD
 * Retorna a string do token (conforme resposta da API)
 */
const gerarToken = async () => {
  const url = `https://api.cobrance.online:3030/gerar-token`;
  const username = process.env.COBRANCE_USERNAME;
  const password = process.env.COBRANCE_PASSWORD;

  if (!username || !password) {
    throw new Error(
      "Credenciais não configuradas: defina COBRANCE_USERNAME e COBRANCE_PASSWORD no .env"
    );
  }

  const response = await axios.post(url, { username, password });
  // Tenta suportar várias formas de retorno: { token }, { accessToken }, ou string
  const token =
    response.data?.accessToken || response.data?.token || response.data;

  if (!token) {
    throw new Error("Não foi possível obter token de autenticação");
  }

  return token;
};

/**
 * Executa o registro do acordo (rota protegida) usando Bearer token gerado
 */
const postAcordoMaster = async (iddevedor, plano) => {
  const url = `https://api.cobrance.online:3030/registro-master-acordo`;

  const token = await gerarToken();

  const response = await axios.post(
    url,
    {
      iddevedor,
      plano,
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  return response.data;
};

module.exports = {
  getListaCredores,
  getOfertasCredor,
  postAcordoMaster,
};
