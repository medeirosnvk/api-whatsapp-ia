const axios = require("axios");

const getListaCredores = async (documento) => {
  const url = `https://api.cobrance.online:3030/lista-credores?documento=${documento}`;

  const response = await axios.get(url);
  return response.data;
};

module.exports = {
  getListaCredores,
};
