const sessionManager = require("../sessionsManager");
const { MessageMedia } = require("whatsapp-web.js");
const { validateAndFormatNumber } = require("./validateNumberService");

const sendBase64Message = async (sessionName, phoneNumber, message) => {
  const session = sessionManager.getSession(sessionName);

  if (!session) {
    throw new Error(`Sessão ${sessionName} não encontrada.`);
  }

  if (session.connectionState !== "open") {
    throw new Error(
      `Sessão ${sessionName} não está conectada. Estado atual: ${session.connectionState}`
    );
  }

  const formattedNumber = await validateAndFormatNumber(phoneNumber);

  let { base64, fileName, caption, mimeType } = message;

  // Verifica se o base64 é um Data URI e extrai o mimeType e os dados
  const dataUriRegex = /^data:(.+?);base64,(.*)$/;
  const match = base64.match(dataUriRegex);

  if (match) {
    // Se for um Data URI, usa o mimeType e os dados extraídos
    mimeType = match[1];
    base64 = match[2];
    console.log(`MIME type extraído do Data URI: ${mimeType}`);
  }

  if (!mimeType) {
    throw new Error(
      "O 'mimeType' é obrigatório quando o base64 não é um Data URI."
    );
  }

  const messageMedia = new MessageMedia(mimeType, base64, fileName);

  await session.client.sendMessage(`${formattedNumber}@c.us`, messageMedia, {
    caption: caption,
  });

  console.log(
    `Mensagem de mídia Base64 enviada com sucesso ao número ${phoneNumber} pela instância ${sessionName} no horário ${new Date()}!`
  );
};

module.exports = { sendBase64Message };
