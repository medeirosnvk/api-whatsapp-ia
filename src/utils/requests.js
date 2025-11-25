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

const postAcordoMaster = async (iddevedor, plano) => {
  const url = `https://api.cobrance.online:3030/registro-master-acordo`;

  const response = await axios.post(url, {
    iddevedor,
    plano,
  });
  return response.data;
};

module.exports = {
  getListaCredores,
  getOfertasCredor,
  postAcordoMaster,
};
