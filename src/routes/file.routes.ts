import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import FileController from "../controllers/FileController";

const router = Router();
const UPLOADS_DIR = path.resolve("uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `${uuidv4()}${extension}`);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite de 10 MB para cada arquivo
  },
});

router.post("/upload", upload.any(), FileController.uploadFile);

router.post(
  "/upload-multiple",
  upload.array("files"),
  FileController.uploadMultipleFiles
);

router.use((error: any, req: any, res: any, next: any) => {
  if (error) {
    return res.status(400).json({
      message: `Falha ao processar upload: ${error.message || "erro desconhecido"}`,
    });
  }
  return next();
});

export default router;
