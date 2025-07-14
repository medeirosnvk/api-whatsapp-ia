const express = require("express");
const path = require("path");
const { listAllFilesController } = require("../controllers/fileController");

const mediaDataPath = path.join(__dirname, "../media");

const fileRoutes = express.Router();

fileRoutes.use(express.urlencoded({ limit: "50mb", extended: true }));
fileRoutes.use(express.static("qrcodes"));
fileRoutes.use("/media", express.static(mediaDataPath));

fileRoutes.get("/listAllFiles", listAllFilesController);

module.exports = fileRoutes;
