import { Request, Response } from "express";
import { Curso } from "../entities";
import FileStorageService from "../utils/FileStorageService";

class CursoController {
  // Listar todos
  public async index(req: Request, res: Response): Promise<Response> {
    try {
      const cursos = await Curso.findAll({ order: [["createdAt", "DESC"]] });
      return res.json(cursos);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }

  // Criar novo (Com Upload)
  public async store(req: Request, res: Response): Promise<Response> {
    try {
      const { titulo, link } = req.body;
      let imagemUrl = "";

      if (req.file) {
        imagemUrl = await FileStorageService.saveCurso(req.file);
      } else {
        imagemUrl = req.body.imagemUrl || "";
      }

      const curso = await Curso.create({ titulo, link, imagemUrl });
      return res.status(201).json(curso);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  // Editar
  public async update(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const { titulo, link } = req.body;

      const curso = await Curso.findByPk(id);
      if (!curso)
        return res.status(404).json({ message: "Curso não encontrado" });

      if (req.file) {
        if (curso.imagemUrl) {
          await FileStorageService.deleteFile(curso.imagemUrl);
        }
        const novaImagemUrl = await FileStorageService.saveCurso(req.file);

        await curso.update({ titulo, link, imagemUrl: novaImagemUrl });
      } else {
        await curso.update({ titulo, link });
      }

      return res.json(curso);
    } catch (error: any) {
      return res.status(400).json({ message: error.message });
    }
  }

  // Deletar
  public async delete(req: Request, res: Response): Promise<Response> {
    try {
      const { id } = req.params;
      const curso = await Curso.findByPk(id);
      if (!curso)
        return res.status(404).json({ message: "Curso não encontrado" });

      if (curso.imagemUrl) {
        await FileStorageService.deleteFile(curso.imagemUrl);
      }

      await curso.destroy();

      return res.status(204).send();
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  }
}

export default new CursoController();
