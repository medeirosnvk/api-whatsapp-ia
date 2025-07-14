const fs = require("fs");
const path = require("path");

const {
  createSession,
} = require("../services/InstanceServices/createSessionService");
const {
  disconnectSession,
} = require("../services/InstanceServices/disconnectSessionService");
const {
  disconnectAllSessions,
} = require("../services/InstanceServices/disconnectAllSessionsService");
const {
  restoreAllSessions,
} = require("../services/InstanceServices/restoreAllSessionsService");
const {
  restoreSession,
} = require("../services/InstanceServices/restoreSessionService");
const {
  deleteSession,
} = require("../services/InstanceServices/deleteSessionService");
const {
  deleteUnusedSessions,
} = require("../services/InstanceServices/deleteUnusedSessionsService");

const createInstanceController = async (req, res) => {
  const { instanceName } = req.body;

  try {
    await createSession(instanceName);
    res
      .status(200)
      .json({ message: `Sessão ${instanceName} criada com sucesso.` });
  } catch (error) {
    console.error("Erro ao criar sessão:", error.message);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createInstanceController,
};
