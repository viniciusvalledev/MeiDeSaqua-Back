import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import CursoController from "../controllers/CursoController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";

const router = Router();
const UPLOADS_DIR = path.resolve("uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
	fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
	storage: multer.diskStorage({
		destination: (req, file, cb) => cb(null, UPLOADS_DIR),
		filename: (req, file, cb) => {
			const extension = path.extname(file.originalname);
			cb(null, `${uuidv4()}${extension}`);
		},
	}),
	limits: {
		fileSize: 10 * 1024 * 1024,
	},
});

router.get("/", CursoController.listarCursos);
router.post("/", adminAuthMiddleware, upload.any(), CursoController.criarCurso);
router.put(
	"/:id",
	adminAuthMiddleware,
	upload.any(),
	CursoController.atualizarCurso,
);
router.delete("/:id", adminAuthMiddleware, CursoController.removerCurso);

export default router;