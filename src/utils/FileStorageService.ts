// src/utils/FileStorageService.ts
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { sanitizeFilename } from "./stringUtils";

const UPLOADS_DIR = path.resolve(__dirname, "..", "..", "uploads");

class FileStorageService {
  private async ensureDirExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }
  public async saveBase64(base64String: string): Promise<string | null> {
    if (!base64String || base64String.trim() === "") {
      return null;
    }

    await this.ensureDirExists(UPLOADS_DIR);

    const matches = base64String.match(
      /^data:(image\/([a-zA-Z]+));base64,(.+)$/,
    );
    if (!matches || matches.length !== 4) {
      throw new Error("Formato de string Base64 inválido.");
    }

    const extension = matches[2];
    const imageBuffer = Buffer.from(matches[3], "base64");
    const uniqueFilename = `${uuidv4()}.${extension}`;
    const filePath = path.join(UPLOADS_DIR, uniqueFilename);

    await fs.writeFile(filePath, imageBuffer);

    // --- CORREÇÃO AQUI ---
    // Retorna a URL completa usando a variável de ambiente e o caminho /uploads/
    return `${process.env.APP_URL}/uploads/${uniqueFilename}`;
  }

  public async save(file: Express.Multer.File): Promise<string> {
    await this.ensureDirExists(UPLOADS_DIR);
    return `/uploads/${file.filename}`;
  }

  public async saveCurso(file: Express.Multer.File): Promise<string> {
    const cursosDir = path.join(UPLOADS_DIR, "cursos");
    await this.ensureDirExists(cursosDir);

    const oldPath = file.path;
    const newPath = path.join(cursosDir, file.filename);

    try {
      await fs.rename(oldPath, newPath);
      return `/uploads/cursos/${file.filename}`;
    } catch (error) {
      console.error("Erro ao mover arquivo de curso:", error);
      throw new Error("Falha ao salvar imagem do curso.");
    }
  }

  public async deleteFile(fileUrl: string): Promise<void> {
    if (!fileUrl) return;

    try {
      const relativePath = fileUrl.startsWith("/")
        ? fileUrl.substring(1)
        : fileUrl;

      let finalPath = relativePath;
      if (fileUrl.includes("/uploads/")) {
        const parts = fileUrl.split("/uploads/");
        if (parts.length >= 2) {
          // parts[1] será "cursos/foto.png"
          finalPath = path.join("uploads", parts[1]);
        }
      }
      let pathInsideUploads = "";
      if (fileUrl.includes("/uploads/")) {
        pathInsideUploads = fileUrl.split("/uploads/")[1];
      } else {
        return;
      }

      const filePath = path.join(UPLOADS_DIR, pathInsideUploads);

      await fs.unlink(filePath);
      console.log(`[FileStorageService] Arquivo deletado: ${filePath}`);
    } catch (error: any) {
      if (error.code !== "ENOENT") {
        console.error(
          `[FileStorageService] Erro ao deletar arquivo: ${error.message}`,
        );
      }
    }
  }

  public async deleteFolder(
    categoria: string,
    nomeFantasia: string,
  ): Promise<void> {
    const safeCategoria = sanitizeFilename(categoria || "geral");
    const safeNomeFantasia = sanitizeFilename(nomeFantasia || "mei_sem_nome");

    const folderPath = path.join(UPLOADS_DIR, safeCategoria, safeNomeFantasia);

    try {
      await fs.rm(folderPath, { recursive: true, force: true });
      console.log(`[FileStorageService] Pasta removida: ${folderPath}`);
    } catch (error: any) {
      console.error(
        `[FileStorageService] Erro ao remover pasta ${folderPath}:`,
        error.message,
      );
    }
  }
}

export default new FileStorageService();
