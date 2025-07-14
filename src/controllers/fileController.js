require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { getAllFiles } = require("../services/FileServices/getAllFilesService");

const mediaDataPath = path.join(__dirname, "../media");
const urlWebhookMedia = process.env.URL_WEBHOOK_MEDIA;

const listAllFilesController = async (req, res) => {
  try {
    if (!fs.existsSync(mediaDataPath)) {
      console.error(`Diretório ${mediaDataPath} não existe`);
      return res
        .status(400)
        .json({ error: `Diretório ${mediaDataPath} não existe` });
    }

    console.log(`Lendo arquivos do diretório: ${mediaDataPath}`);
    const files = getAllFiles(mediaDataPath);

    const fileStats = files.map((file) => {
      const stat = fs.statSync(file);
      return { file, mtime: stat.mtime };
    });

    fileStats.sort((a, b) => b.mtime - a.mtime);

    const fileUrls = fileStats.map(({ file }) => ({
      fileName: path.basename(file),
      url: `${urlWebhookMedia}/media${file
        .replace(mediaDataPath, "")
        .replace(/\\/g, "/")}`,
    }));

    res.status(200).json(fileUrls);
  } catch (error) {
    console.error("Erro ao ler o diretório", error);
    res.status(500).json({ error: "Erro ao tentar ler o diretório" });
  }
};

module.exports = {
  listAllFilesController,
};
