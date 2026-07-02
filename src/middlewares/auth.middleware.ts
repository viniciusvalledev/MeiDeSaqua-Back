import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
  };
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[MIDDLEWARE DEBUG] ❌ Falha: Sem token ou formato incorreto.");
    return res
      .status(401)
      .json({ message: "Acesso negado. Token não fornecido." });
  }

  const token = authHeader.substring(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
      id: number;
      username: string;
    };
    console.log(
      "[MIDDLEWARE DEBUG] ✅ Token decodificado com sucesso! ID:",
      decoded.id,
    );
    req.user = decoded;
    next();
  } catch (error) {
    console.log("[MIDDLEWARE DEBUG] ❌ Falha na verificação do JWT:", error);
    return res.status(401).json({ message: "Token inválido ou expirado." });
  }
}
