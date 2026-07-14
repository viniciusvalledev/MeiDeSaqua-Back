import Curso from "../entities/Curso.entity";

type CursoPayload = {
  nome?: unknown;
  descricao?: unknown;
  link?: unknown;
  imagemUrl?: unknown;
  ativo?: unknown;
};

class CursoService {
  private normalizePayload(payload?: CursoPayload, isUpdate = false) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("Corpo da requisição inválido.");
    }

    const normalized: {
      nome?: string;
      descricao?: string | null;
      link?: string | null;
      imagemUrl?: string | null;
      ativo?: boolean;
    } = {};

    if (!isUpdate || payload.nome !== undefined) {
      if (typeof payload.nome !== "string" || payload.nome.trim().length === 0) {
        throw new Error("O campo 'nome' é obrigatório.");
      }
      normalized.nome = payload.nome.trim();
    }

    if (payload.descricao !== undefined) {
      if (payload.descricao !== null && typeof payload.descricao !== "string") {
        throw new Error("O campo 'descricao' deve ser string ou null.");
      }
      normalized.descricao = payload.descricao;
    }

    if (payload.link !== undefined) {
      if (payload.link !== null && typeof payload.link !== "string") {
        throw new Error("O campo 'link' deve ser string ou null.");
      }
      normalized.link = payload.link;
    }

    if (payload.imagemUrl !== undefined) {
      if (payload.imagemUrl !== null && typeof payload.imagemUrl !== "string") {
        throw new Error("O campo 'imagemUrl' deve ser string ou null.");
      }
      normalized.imagemUrl = payload.imagemUrl;
    }

    if (payload.ativo !== undefined) {
      if (typeof payload.ativo !== "boolean") {
        throw new Error("O campo 'ativo' deve ser boolean.");
      }
      normalized.ativo = payload.ativo;
    }

    return normalized;
  }

  public async listarTodos() {
    return Curso.findAll({
      order: [["createdAt", "DESC"]],
    });
  }

  public async criar(payload: CursoPayload) {
    const dados = this.normalizePayload(payload, false);
    return Curso.create(dados);
  }

  public async atualizar(cursoId: number, payload: CursoPayload) {
    const curso = await Curso.findByPk(cursoId);
    if (!curso) {
      throw new Error("Curso não encontrado.");
    }

    const dados = this.normalizePayload(payload, true);
    if (Object.keys(dados).length === 0) {
      throw new Error("Nenhum campo válido foi informado para atualização.");
    }

    await curso.update(dados);
    return curso;
  }

  public async remover(cursoId: number) {
    const curso = await Curso.findByPk(cursoId);
    if (!curso) {
      throw new Error("Curso não encontrado.");
    }

    await curso.destroy();
  }
}

export default new CursoService();