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

const qrCodeDir = path.join(__dirname, "qrcodes");
const mediaDir = path.join(__dirname, "media");
const clientDataFile = path.join(__dirname, "clientData.json");

const port = process.env.PORT || 3000;

const app = express();

const inicializarDiretorios = async () => {
  if (!fs.existsSync(path.join(__dirname, "../qrcodes"))) {
    console.log("Diretório 'qrcodes' não existe, criando...");
    fs.mkdirSync(qrCodeDir);
  }

  if (!fs.existsSync(mediaDir)) {
    console.log("Diretório 'media' não existe, criando...");
    fs.mkdirSync(mediaDir);
  }
};

const carregarSessoes = async () => {
  if (fs.existsSync(clientDataFile)) {
    sessions = JSON.parse(fs.readFileSync(clientDataFile, "utf8"));
    Object.keys(sessions).forEach((instanceName) => {
      sessions[instanceName].connectionState = "disconnected";
    });
    console.log("Diretório 'media' não existe, criando...");
    fs.writeFileSync(clientDataFile, JSON.stringify(sessions, null, 2));
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
    process.exit(1); // Encerra o processo
  });

  process.on("unhandledRejection", (reason) => {
    console.error("Rejeição de Promessa Não Tratada:", reason);
    lidarErrosRejeicao(reason);
  });
};

const httpServer = async () => {
  app.listen(port, () => {
    console.log(`Servidor HTTP LOCALHOST iniciado na porta ${port}`);

    restoreAllSessions();
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
