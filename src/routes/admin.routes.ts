import { Router } from "express";
import { AdminController } from "../controllers/AdminController";
import { adminAuthMiddleware } from "../middlewares/adminAuth.middleware";
import multer from "multer";

const router = Router();
const upload = multer();

router.post("/login", AdminController.login);

router.get("/pending", adminAuthMiddleware, AdminController.getPending);
router.post(
  "/approve/:id",
  adminAuthMiddleware,
  AdminController.approveRequest,
);
router.post(
  "/edit-and-approve/:id",
  adminAuthMiddleware,
  upload.any(),
  AdminController.editAndApproveRequest,
);
router.post(
  "/approve/:id",
  adminAuthMiddleware,
  AdminController.approveRequest,
);
router.post("/reject/:id", adminAuthMiddleware, AdminController.rejectRequest);

router.get(
  "/estabelecimentos-ativos",
  adminAuthMiddleware,
  AdminController.getAllActiveEstabelecimentos,
);

router.patch(
  "/estabelecimento/:id",
  adminAuthMiddleware,
  upload.any(),
  AdminController.adminUpdateEstabelecimento,
);

router.delete(
  "/estabelecimento/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteEstabelecimento,
);

router.get(
  "/avaliacoes/estabelecimento/:estabelecimentoId",
  adminAuthMiddleware,
  AdminController.getAvaliacoesByEstabelecimento,
);

// Rota para admin excluir uma avaliação
router.delete(
  "/avaliacoes/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteAvaliacao,
);
router.get(
  "/exportar-estabelecimentos",
  adminAuthMiddleware,
  AdminController.exportActiveEstabelecimentos,
);

router.get(
  "/dashboard-stats",
  adminAuthMiddleware,
  AdminController.getDashboardStats,
);

// ====== Rota para ADMIN gerenciar usuários=====
router.get("/users", adminAuthMiddleware, AdminController.getAllUsers);

router.put("/users/:id", adminAuthMiddleware, AdminController.adminUpdateUser);

router.delete(
  "/users/:id",
  adminAuthMiddleware,
  AdminController.adminDeleteUser,
);

router.patch(
  "/users/:id/password",
  adminAuthMiddleware,
  AdminController.adminChangePassword,
);
router.post(
  "/users/:id/resend-confirmation",
  adminAuthMiddleware,
  AdminController.resendConfirmationEmail,
);
// =================================

export default router;
