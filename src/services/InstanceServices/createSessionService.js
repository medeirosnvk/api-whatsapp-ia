require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const { saveQRCodeImage } = require("./saveQRCodeImageService");
const saveClientDataService = require("../../services/InstanceServices/saveClientDataService");
const sessionsManager = require("../../services/sessionsManager");
const qrcode = require("qrcode-terminal");
const axios = require("axios");

const sessoesAtivas = new Set();
const usuariosAtendidos = new Set();

const urlWebhookResponse = process.env.URL_WEBHOOK_RESPONSE;
const urlWebhookMedia = process.env.URL_WEBHOOK_MEDIA;
const apiKeyGemini = process.env.GEMINI_API_KEY;

const createSession = async (sessionName) => {
  const session = sessionsManager.getSession(sessionName);

  if (sessoesAtivas.has(sessionName)) {
    if (session && session.connectionState !== "open") {
      console.log(
        `A sessão ${sessionName} já está sendo criada. Aguardando...`
      );
      return null; // A sessão está sendo criada, aguardar
    }
  }

  sessoesAtivas.add(sessionName);

  if (session) {
    if (session.connectionState === "open") {
      console.log(`A sessão ${sessionName} já está conectada.`);
      return session; // Retorna a sessão se já estiver conectada
    }
    console.log(`A sessão ${sessionName} existe, mas não está conectada.`);
  }

  let isQRFunctionExposed = false;

  try {
    const localAuth = new LocalAuth({ clientId: sessionName });
    const client = new Client({
      authStrategy: localAuth,
      puppeteer: {
        headless: true,
        args: [
          "--no-default-browser-check",
          "--disable-session-crashed-bubble",
          "--disable-dev-shm-usage",
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
        ],
      },
    });

    client.sessionName = sessionName;
    client.connectionState = "connecting";

    sessionsManager.addSession(sessionName, client, {
      connectionState: "connecting",
    });

    const qrTimeout = setTimeout(() => {
      if (client.connectionState !== "open") {
        client.connectionState = "disconnected";
        console.log(
          `Tempo esgotado para a sessão ${sessionName}. Desconectando...`
        );
        client.destroy();
        sessionsManager.removeSession(sessionName);
      }
    }, 2 * 60 * 1000);

    client.on("qr", async (qr) => {
      try {
        if (!isQRFunctionExposed) {
          console.log(`QR Code para a sessão ${sessionName}:`);
          qrcode.generate(qr, { small: true });
          await saveQRCodeImage(qr, sessionName);
          isQRFunctionExposed = true;
        }
      } catch (error) {
        console.error("Erro ao lidar com QR Code:", error.message);
      }
    });

    client.on("ready", async () => {
      try {
        if (qrTimeout) {
          clearTimeout(qrTimeout);
          console.log("Timeout de QR Code limpo com sucesso.");
        }

        client.connectionState = "open";

        // Salvar os dados do cliente no sessionManager
        saveClientDataService.addOrUpdateDataSession(client);
        sessionsManager.updateSession(sessionName, {
          client,
          connectionState: "open",
        });

        console.log(
          `Sessão ${sessionName} foi salva como 'open' no sessionsManager.`
        );
        console.log(`Sessão ${sessionName} está pronta!`);
      } catch (error) {
        console.error(`Erro ao configurar a sessão "${sessionName}":`, error);
        sessionsManager.removeSession(sessionName);
      }
    });

    client.on("disconnected", async (data) => {
      try {
        clearTimeout(qrTimeout);
        console.error(`Sessão ${sessionName} foi desconectada.`);

        client.connectionState = "disconnected";
        sessionsManager.updateSession(sessionName, {
          connectionState: "disconnected",
        });
        saveClientDataService.addOrUpdateDataSession(client);

        await client.logout();
      } catch (error) {
        console.error("Erro ao lidar com desconexão:", error.message);

        if (
          error.message.includes("Cannot read properties of undefined") ||
          error.message.includes("ENOTEMPTY") ||
          error.message.includes(
            "Protocol error (Runtime.callFunctionOn): Target closed"
          )
        ) {
          console.error(
            "Erro ao acessar propriedades indefinidas ou diretório não vazio durante a desconexão:",
            error.message
          );
          sessionsManager.updateSession(sessionName, {
            connectionState: "banned",
          });
          saveClientDataService.addOrUpdateDataSession(client);
        }
      }
    });

    client.on("auth_failure", async (data) => {
      clearTimeout(qrTimeout);
      console.error(`Sessão ${sessionName} falhou na autenticação.`);

      client.connectionState = "auth_failure";
      sessionsManager.updateSession(sessionName, {
        connectionState: "auth_failure",
      });
      saveClientDataService.addOrUpdateDataSession(client);

      if (data.includes("ban")) {
        console.error(`A sessão ${sessionName} foi banida.`);
        sessionsManager.updateSession(sessionName, {
          connectionState: "banned",
        });
      }
    });

    client.on("connection-state-changed", async (state) => {
      console.log(`Estado da conexão mudou para ${sessionName}:`, state);
      sessionsManager.updateSession(sessionName, { connectionState: state });
    });

    client.on("message", async (message) => {
      const userId = message.from;
      const userMessage = message.body;
      const numeroRespostaIA = "555180307836@c.us";

      if (message.fromMe) return;
      if (userId.endsWith("@g.us")) return;
      if (userId !== numeroRespostaIA) return;

      const promptInicial = `
        Você é um atendente virtual inteligente da empresa Cobrance Recuperadora de crédito.
        Sua tarefa é perguntar os dados do usuario como cpfcnpj para posteriormente buscar os dados do cliente e retornar informacoes sobre pendencias financeiras.
        Endpoint pata buscar os dados do cliente apos recebimento do documento do cliente.
        Endpoint: https://api.cobrance.online:3030/lista-credores?documento={cpfcnpj}
        Em posse destes dados, informe o cliente o valor da divida=saldo.
        Responda sempre de forma clara e sucinta com textos curtos, amigável e profissional.
        Nunca diga que você é uma IA.
      `;

      // Envia mensagem de boas-vindas apenas uma vez por usuário
      if (!usuariosAtendidos.has(userId)) {
        await message.reply(
          "Olá! Obrigado pelo seu contato com a Cobrance. Estou aqui para te ajudar com a sua negociação ou demais dúvidas."
        );
        usuariosAtendidos.add(userId);
      }

      try {
        // Aguarda 10 segundos antes de responder
        // await new Promise((resolve) => setTimeout(resolve, 10000));

        const response = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKeyGemini}`,
          {
            contents: [
              { role: "user", parts: [{ text: promptInicial }] },
              { role: "user", parts: [{ text: userMessage }] },
            ],
          },
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        const respostaIA =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

        if (respostaIA) {
          await message.reply(respostaIA);
        } else {
          await message.reply("Desculpe, não consegui entender sua mensagem.");
        }
      } catch (err) {
        console.error(
          "Erro ao consultar Gemini API:",
          err?.response?.data || err.message
        );
      }
    });

    await client.initialize();

    return client;
  } catch (error) {
    console.error(`Erro ao criar a sessão ${sessionName}:`, error);
    sessionsManager.removeSession(sessionName);
  }
};

module.exports = {
  createSession,
};
