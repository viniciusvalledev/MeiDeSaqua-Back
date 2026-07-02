import { Router } from "express";
import multer from "multer";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import CursoController from "../controllers/CursoController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.resolve(__dirname, "..", "..", "uploads"));
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);
    cb(null, `${uuidv4()}${extension}`);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

// Rota pública
router.get("/", CursoController.index);

router.post(
  "/",
  adminAuthMiddleware,
  upload.single("file"),
  CursoController.store,
);
router.put(
  "/:id",
  adminAuthMiddleware,
  upload.single("file"),
  CursoController.update,
);
router.delete("/:id", adminAuthMiddleware, CursoController.delete);

export default router;
