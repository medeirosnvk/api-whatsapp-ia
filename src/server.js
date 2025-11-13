require("dotenv").config();
const fs = require("fs");
const https = require("https");
const express = require("express");
const cors = require("cors");
const path = require("path");
const { setupSwagger } = require("./config/documentation/swagger");
const fileRoutes = require("../src/routes/fileRoutes");
const instanceRoutes = require("../src/routes/instanceRoutes");
const messageRoutes = require("../src/routes/messageRoutes");
const qrCodeRoutes = require("../src/routes/qrCodeRoutes");
const {
  restoreAllSessions,
} = require("../src/services/InstanceServices/restoreAllSessionsService");

const qrCodeDir = path.join(__dirname, "../temp/qrcodes");
const mediaDir = path.join(__dirname, "../temp/media");
const clientDataFile = path.join(__dirname, "../temp/clientData.json");

const port = process.env.PORT || 3000;

const app = express();

const inicializarDiretorios = async () => {
  // Certifique-se de que o diretório qrcodes na raiz do projeto exista
  if (!fs.existsSync(qrCodeDir)) {
    console.log("Diretório 'qrcodes' não existe, criando...");
    fs.mkdirSync(qrCodeDir, { recursive: true });
  }

  // Diretório de mídia local dentro de src
  if (!fs.existsSync(mediaDir)) {
    console.log("Diretório 'media' não existe, criando...");
    fs.mkdirSync(mediaDir, { recursive: true });
  }
};

const carregarSessoes = async () => {
  // sessions é um objeto que mantém o estado carregado de clientDataFile
  let sessions = {};
  if (fs.existsSync(clientDataFile)) {
    try {
      sessions = JSON.parse(fs.readFileSync(clientDataFile, "utf8"));
      Object.keys(sessions).forEach((instanceName) => {
        sessions[instanceName].connectionState = "disconnected";
      });
      // Atualiza o arquivo com os estados ajustados
      fs.writeFileSync(clientDataFile, JSON.stringify(sessions, null, 2));
      console.log(
        "Arquivo clientData.json carregado e atualizado com estados 'disconnected'."
      );
    } catch (err) {
      console.error("Erro ao carregar clientData.json:", err.message);
    }
  } else {
    // Se não existir, cria um arquivo vazio para evitar leituras futuras falhas
    fs.writeFileSync(clientDataFile, JSON.stringify(sessions, null, 2));
    console.log("Arquivo clientData.json não existe, criando...");
  }
};

const lidarErrosRejeicao = async (reason) => {
  if (reason.code === "ENOTEMPTY") {
    console.error("Diretório não está vazio. Tentando nova operação...");
  } else if (
    reason instanceof TypeError &&
    reason.message.includes(
      "Cannot read properties of undefined (reading 'AppState')"
    )
  ) {
    console.error(
      "Erro ao acessar propriedades indefinidas. Descartando operação..."
    );
  } else if (
    reason instanceof Error &&
    reason.message.includes(
      "Failed to add page binding with name onQRChangedEvent"
    )
  ) {
    console.error("Erro: O nome 'onQRChangedEvent' já existe. Ignorando...");
  } else if (
    reason instanceof Error &&
    reason.message.includes("window is not defined")
  ) {
    console.error(
      "Erro: O objeto 'window' não está disponível. Verifique o contexto de execução."
    );
  } else {
    fs.appendFileSync(
      "error.log",
      `Rejeição de Promessa Não Tratada: ${reason}\n`
    );
  }
};

const configurarErrosPossiveis = async () => {
  process.on("uncaughtException", (err) => {
    console.error("Exceção Não Tratada:", err);
    try {
      fs.appendFileSync(
        "error.log",
        `Exceção Não Tratada: ${err.stack || err}\n`
      );
    } catch (e) {
      console.error("Falha ao escrever em error.log:", e.message);
    }
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Rejeição de Promessa Não Tratada:", reason);
    try {
      lidarErrosRejeicao(reason);
      fs.appendFileSync(
        "error.log",
        `Rejeição de Promessa Não Tratada: ${reason}\n`
      );
    } catch (e) {
      console.error("Falha ao lidar com unhandledRejection:", e.message);
    }
  });
};

const httpServer = async () => {
  app.listen(port, async () => {
    console.log(`Servidor Http Localhost iniciado na porta ${port}`);

    try {
      // Aguarda a restauração de sessões com timeout para evitar travar
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("Timeout ao restaurar sessões")),
          5 * 60 * 1000
        )
      );

      await Promise.race([restoreAllSessions(), timeoutPromise]);
      console.log("Restauração de sessões finalizada com sucesso.");
    } catch (err) {
      console.error("Erro ao restaurar sessões:", err.message || err);
      console.log("Servidor continuará rodando sem as sessões restauradas.");
    }
  });
};

const iniciarServer = async () => {
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));

  app.use(instanceRoutes);
  app.use(qrCodeRoutes);
  app.use(messageRoutes);
  app.use(fileRoutes);

  setupSwagger(app);

  httpServer();
};

inicializarDiretorios();
carregarSessoes();
configurarErrosPossiveis();
iniciarServer();
