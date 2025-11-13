async function verificarIntencao(userMessage) {
  const texto = userMessage.toLowerCase();

  // Intenção: Início de negociação
  if (
    texto.includes("quero negociar") ||
    texto.includes("desejo negociar") ||
    texto.includes("fazer acordo") ||
    texto.includes("pagar divida") ||
    texto.includes("parcelar dívida")
  ) {
    return {
      intent: "inicio_negociacao",
      message: "Claro! Para começarmos, por favor, me informe seu CPF ou CNPJ.",
    };
  }

  // Intenção: Informar documento
  if (texto.match(/\b(\d{11}|\d{14})\b/)) {
    return {
      intent: "informar_documento",
      message: "Obrigado! Consultando suas dívidas, só um instante...",
    };
  }

  // Intenção: Saber dívidas
  if (
    texto.includes("minhas dívidas") ||
    texto.includes("estou devendo") ||
    texto.includes("o que devo")
  ) {
    return {
      intent: "consultar_dividas",
      message:
        "Certo! Me informe seu CPF ou CNPJ para eu consultar suas pendências.",
    };
  }

  // Intenção: Escolher empresa
  if (texto.match(/\bescolho\b|\bempresa\b|\bopção\b|\bnúmero\b\s*\d/)) {
    return {
      intent: "escolher_empresa",
      message: "Perfeito! Consultando as ofertas dessa empresa...",
    };
  }

  // Intenção: Escolher oferta
  if (texto.match(/\b(escolho|aceito|quero)\b.*?(oferta|opção)/)) {
    return {
      intent: "escolher_oferta",
      message: "Gerando seu acordo, por favor aguarde...",
    };
  }

  return null;
}

module.exports = verificarIntencao;
