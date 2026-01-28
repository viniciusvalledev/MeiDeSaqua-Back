import { Request, Response } from "express";
import Estabelecimento, {
  StatusEstabelecimento,
} from "../entities/Estabelecimento.entity"; // Assumindo que Estabelecimento.entity.ts existe
import * as jwt from "jsonwebtoken";
import ImagemProduto from "../entities/ImagemProduto.entity"; // Verifique se o caminho está correto
import sequelize from "../config/database";
import fs from "fs/promises";
import path from "path";
import EmailService from "../utils/EmailService";
import EstabelecimentoService from "../services/EstabelecimentoService";
import Avaliacao from "../entities/Avaliacao.entity";
import Usuario from "../entities/Usuario.entity";
import * as bcrypt from "bcryptjs";
import * as crypto from "crypto";
import ContadorVisualizacao from "../entities/ContadorVisualizacao.entity";

const ADMIN_USER = process.env.ADMIN_USER;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const JWT_SECRET = process.env.ADMIN_JWT_SECRET;

if (!ADMIN_USER || !ADMIN_PASSWORD || !JWT_SECRET) {
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  console.error("ERRO CRÍTICO: Variáveis de ambiente do Admin não definidas.");
  console.error(
    "Por favor, defina ADMIN_USER, ADMIN_PASSWORD, e ADMIN_JWT_SECRET",
  );
  console.error(
    "no seu ficheiro .env (ou .env.local) antes de iniciar o servidor.",
  );
  console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
  throw new Error(
    "Credenciais de administrador ou segredo JWT não configurados.",
  );
}

export class AdminController {
  static async login(req: Request, res: Response) {
    const { username, password } = req.body;

    if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
      const token = jwt.sign(
        { username, role: "admin" },
        JWT_SECRET as string,
        {
          expiresIn: "8h",
        },
      );
      return res.json({ success: true, token });
    }

    return res
      .status(401)
      .json({ success: false, message: "Credenciais inválidas" });
  }

  static async getPending(req: Request, res: Response) {
    try {
      const includeOptions = {
        model: ImagemProduto,
        // ***** CORREÇÃO DO ALIAS AQUI *****
        as: "produtosImg", // <-- Este é o alias correto
        attributes: ["url"],
      };

      const cadastros = await Estabelecimento.findAll({
        where: { status: StatusEstabelecimento.PENDENTE_APROVACAO },
        include: [includeOptions],
      });
      const atualizacoes = await Estabelecimento.findAll({
        where: { status: StatusEstabelecimento.PENDENTE_ATUALIZACAO },
        include: [includeOptions],
      });
      const exclusoes = await Estabelecimento.findAll({
        where: { status: StatusEstabelecimento.PENDENTE_EXCLUSAO },
        include: [includeOptions],
      });

      return res.json({ cadastros, atualizacoes, exclusoes });
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro ao buscar solicitações pendentes." });
    }
  }

  static async approveRequest(req: Request, res: Response) {
    const { id } = req.params;
    const transaction = await sequelize.transaction();

    try {
      let responseMessage = "Solicitação aprovada com sucesso.";

      const estabelecimento = await Estabelecimento.findByPk(id, {
        transaction,
        // ***** ALIAS CORRETO *****
        include: [{ model: ImagemProduto, as: "produtosImg" }],
      });
      if (!estabelecimento) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ message: "Estabelecimento não encontrado." });
      }
      let emailInfo: { subject: string; html: string } | null = null;

      switch (estabelecimento.status) {
        case StatusEstabelecimento.PENDENTE_APROVACAO:
          estabelecimento.status = StatusEstabelecimento.ATIVO;
          estabelecimento.ativo = true;
          await estabelecimento.save({ transaction });

          emailInfo = {
            subject: "Seu cadastro no MeideSaquá foi Aprovado!",
            html: `
              <h1>Olá, ${estabelecimento.nomeResponsavel}!</h1>
              <p>Temos uma ótima notícia: o seu estabelecimento, <strong>${estabelecimento.nomeFantasia}</strong>, foi aprovado e já está visível na nossa plataforma!</p>
              <p>A partir de agora, clientes podem encontrar o seu negócio e deixar avaliações.</p>
              <p>Agradecemos por fazer parte da comunidade de empreendedores de Saquarema.</p>
              <br>
              <p>Atenciosamente,</p>
              <p><strong>Equipe MeideSaquá.</strong></p>
            `,
          };
          break;

        case StatusEstabelecimento.PENDENTE_ATUALIZACAO:
          if (estabelecimento.dados_atualizacao) {
            const dadosRecebidos = estabelecimento.dados_atualizacao as any;
            const dadosParaAtualizar: Partial<Estabelecimento> & {
              [key: string]: any;
            } = {};

            // ***** CORREÇÃO 1: LISTA DE CAMPOS PERMITIDOS COMPLETA *****
            // (Agora inclui telefone, email, e todos os outros campos)
            const camposPermitidos: (keyof Estabelecimento | string)[] = [
              "nomeFantasia",
              "cnpj",
              "categoria",
              "nomeResponsavel",
              "cpfResponsavel",
              "cnae",
              "emailEstabelecimento",
              "contatoEstabelecimento", // <-- TELEFONE
              "endereco",
              "descricao",
              "descricaoDiferencial",
              "areasAtuacao",
              "tagsInvisiveis",
              "website",
              "instagram",
              "descricaoDiferencial",
              "descricao",
              "objetivo",
              "justificativa",
              "publicoAlvo",
              "impacto",
            ];
            // ***** FIM DA CORREÇÃO 1 *****

            for (const key of camposPermitidos) {
              if (
                dadosRecebidos.hasOwnProperty(key) &&
                dadosRecebidos[key] != null
              ) {
                (dadosParaAtualizar as any)[key] = dadosRecebidos[key];
              }
            }

            // Lógica para LOGO (Esta já estava correta)
            if (dadosRecebidos.logo) {
              const logoAntigaUrl = estabelecimento.logoUrl;
              if (logoAntigaUrl) {
                try {
                  const filePath = path.join(
                    __dirname,
                    "..",
                    "..",
                    logoAntigaUrl,
                  );
                  await fs.unlink(filePath);
                } catch (err) {
                  console.error(
                    `AVISO: Falha ao deletar logo antiga: ${logoAntigaUrl}`,
                    err,
                  );
                }
              }
              dadosParaAtualizar.logoUrl = dadosRecebidos.logo;
            }

            // ***** CORREÇÃO 2: LÓGICA DE IMAGENS *****
            // (Trocado 'imagens' por 'produtos', que é o nome correto do campo)
            if (
              dadosRecebidos.produtos &&
              Array.isArray(dadosRecebidos.produtos) &&
              dadosRecebidos.produtos.length > 0
            ) {
              // ***** FIM DA CORREÇÃO 2 *****

              const imagensAntigas = await ImagemProduto.findAll({
                where: { estabelecimentoId: estabelecimento.estabelecimentoId },
                transaction,
              });

              for (const imagem of imagensAntigas) {
                try {
                  const filePath = path.join(__dirname, "..", "..", imagem.url);
                  await fs.unlink(filePath);
                } catch (err) {
                  console.error(
                    `AVISO: Falha ao deletar imagem antiga: ${imagem.url}`,
                    err,
                  );
                }
              }

              await ImagemProduto.destroy({
                where: { estabelecimentoId: estabelecimento.estabelecimentoId },
                transaction,
              });

              // ***** CORREÇÃO 2 (continuação) *****
              const novasImagens = dadosRecebidos.produtos.map(
                // ***** FIM DA CORREÇÃO 2 *****
                (url: string) => ({
                  url,
                  estabelecimentoId: estabelecimento.estabelecimentoId,
                }),
              );
              await ImagemProduto.bulkCreate(novasImagens, { transaction });
            }

            dadosParaAtualizar.dados_atualizacao = null;
            dadosParaAtualizar.status = StatusEstabelecimento.ATIVO;
            dadosParaAtualizar.ativo = true;

            await estabelecimento.update(dadosParaAtualizar, { transaction });
          } else {
            estabelecimento.dados_atualizacao = null;
            estabelecimento.status = StatusEstabelecimento.ATIVO;
            estabelecimento.ativo = true;
            await estabelecimento.save({ transaction });
          }

          emailInfo = {
            subject:
              "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
            html: `
              <h1>Olá, ${estabelecimento.nomeResponsavel}!</h1>
              <p>A sua solicitação para atualizar os dados do estabelecimento <strong>${estabelecimento.nomeFantasia}</strong> foi aprovada.</p>
              <p>As novas informações já estão visíveis para todos na plataforma.</p>
              <br>
              <p>Atenciosamente,</p>
              <p><strong>Equipe MeideSaquá</strong></p>
            `,
          };
          break;

        case StatusEstabelecimento.PENDENTE_EXCLUSAO:
          // TODO: Adicionar lógica para deletar arquivos (logo, imagens) ANTES do destroy
          emailInfo = {
            subject:
              "Seu estabelecimento foi removido da plataforma MeideSaquá",
            html: `
              <h1>Olá, ${estabelecimento.nomeResponsavel}.</h1>
              <p>Informamos que a sua solicitação para remover o estabelecimento <strong>${estabelecimento.nomeFantasia}</strong> da nossa plataforma foi concluída com sucesso.</p>
              <p>Lamentamos a sua partida e esperamos poder colaborar com você novamente no futuro.</p>
              <br>
              <p>Atenciosamente,</p>
              <p><strong>Equipe MeideSaquá</strong></p>
            `,
          };
          await estabelecimento.destroy({ transaction });
          responseMessage = "Estabelecimento excluído com sucesso.";

          break;
      }

      await transaction.commit();

      if (emailInfo && estabelecimento.emailEstabelecimento) {
        try {
          await EmailService.sendGenericEmail({
            to: estabelecimento.emailEstabelecimento,
            subject: emailInfo.subject,
            html: emailInfo.html,
          });
          console.log(
            `Email de notificação enviado com sucesso para ${estabelecimento.emailEstabelecimento}`,
          );
        } catch (error) {
          console.error(
            `Falha ao enviar email de notificação para ${estabelecimento.emailEstabelecimento}:`,
            error,
          );
        }
      } else if (emailInfo) {
        console.warn(
          `Tentativa de enviar email para estabelecimento ID ${estabelecimento.estabelecimentoId} sem emailContato definido.`,
        );
      }

      return res.status(200).json({ message: responseMessage });
    } catch (error) {
      await transaction.rollback();
      console.error("ERRO DURANTE A APROVAÇÃO:", error);
      return res
        .status(500)
        .json({ message: "Erro ao aprovar a solicitação." });
    }
  }
  static async editAndApproveRequest(req: Request, res: Response) {
    const { id } = req.params;
    const adminEditedData = req.body;

    // ***** CORREÇÃO 1: Fazer o parse do urlsParaExcluir (que vem como string JSON) *****
    let { urlsParaExcluir } = adminEditedData;
    if (urlsParaExcluir && typeof urlsParaExcluir === "string") {
      try {
        urlsParaExcluir = JSON.parse(urlsParaExcluir);
      } catch (e) {
        console.error(
          "Falha ao parsear urlsParaExcluir em editAndApproveRequest:",
          e,
        );
        urlsParaExcluir = [];
      }
    }
    // ***** FIM DA CORREÇÃO 1 *****

    const transaction = await sequelize.transaction();

    try {
      const estabelecimento = await Estabelecimento.findByPk(id, {
        transaction,
        // ***** CORREÇÃO DO ALIAS AQUI *****
        include: [{ model: ImagemProduto, as: "produtosImg" }], // <-- Este é o alias correto
      });

      if (!estabelecimento) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ message: "Estabelecimento não encontrado." });
      }

      let emailInfo: { subject: string; html: string } | null = null;
      const statusOriginal = estabelecimento.status;
      const dadosRecebidos = (estabelecimento.dados_atualizacao || {}) as any;

      if (
        statusOriginal === StatusEstabelecimento.PENDENTE_ATUALIZACAO &&
        estabelecimento.dados_atualizacao
      ) {
        // Lógica para LOGO

        // ***** CORREÇÃO 2: Corrigir o bug do hasOwnProperty E checar por "DELETE" *****
        if (
          "logoUrl" in adminEditedData &&
          adminEditedData.logoUrl === "DELETE"
        ) {
          const logoAntigaUrl = estabelecimento.logoUrl || dadosRecebidos.logo;
          if (logoAntigaUrl) {
            try {
              const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
              await fs.unlink(filePath);
            } catch (err) {
              console.error(
                `AVISO: Falha ao deletar logo: ${logoAntigaUrl}`,
                err,
              );
            }
          }
          adminEditedData.logoUrl = null;
        }
        // ***** FIM DA CORREÇÃO 2 *****
        else if (dadosRecebidos.logo) {
          const logoAntigaUrl = estabelecimento.logoUrl;
          if (logoAntigaUrl) {
            try {
              const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
              await fs.unlink(filePath);
            } catch (err) {
              console.error(
                `AVISO: Falha ao deletar logo antiga: ${logoAntigaUrl}`,
                err,
              );
            }
          }
          adminEditedData.logoUrl = dadosRecebidos.logo;
        }

        // Lógica para IMAGENS
        if (
          dadosRecebidos.imagens &&
          Array.isArray(dadosRecebidos.imagens) &&
          dadosRecebidos.imagens.length > 0
        ) {
          const imagensAntigas = await ImagemProduto.findAll({
            where: { estabelecimentoId: estabelecimento.estabelecimentoId },
            transaction,
          });

          for (const imagem of imagensAntigas) {
            try {
              const filePath = path.join(__dirname, "..", "..", imagem.url);
              await fs.unlink(filePath);
            } catch (err) {
              /* ... log ... */
            }
          }

          await ImagemProduto.destroy({
            where: { estabelecimentoId: estabelecimento.estabelecimentoId },
            transaction,
          });

          const imagensParaCriar = dadosRecebidos.imagens.filter(
            (url: string) =>
              !(urlsParaExcluir && urlsParaExcluir.includes(url)),
          );

          const novasImagens = imagensParaCriar.map((url: string) => ({
            url,
            estabelecimentoId: estabelecimento.estabelecimentoId,
          }));
          await ImagemProduto.bulkCreate(novasImagens, { transaction });
        } else if (
          urlsParaExcluir &&
          Array.isArray(urlsParaExcluir) &&
          urlsParaExcluir.length > 0
        ) {
          const imagensParaDeletar = await ImagemProduto.findAll({
            where: {
              url: urlsParaExcluir,
              estabelecimentoId: estabelecimento.estabelecimentoId,
            },
            transaction,
          });

          for (const imagem of imagensParaDeletar) {
            try {
              const filePath = path.join(__dirname, "..", "..", imagem.url);
              await fs.unlink(filePath);
            } catch (err) {
              /* ... log ... */
            }
          }

          await ImagemProduto.destroy({
            where: {
              id: imagensParaDeletar.map((img) => img.id),
            },
            transaction,
          });
        }
      }

      delete adminEditedData.urlsParaExcluir;

      await estabelecimento.update(
        {
          ...adminEditedData,
          status: StatusEstabelecimento.ATIVO,
          ativo: true,
          dados_atualizacao: null,
        },
        { transaction },
      );

      if (statusOriginal === StatusEstabelecimento.PENDENTE_APROVACAO) {
        emailInfo = {
          subject: "Seu cadastro no MeideSaquá foi Aprovado!",
          html: `<h1>Olá, ${estabelecimento.nomeResponsavel}!</h1> <p>Temos uma ótima notícia: o seu estabelecimento, <strong>${estabelecimento.nomeFantasia}</strong>, foi aprovado (com algumas edições do administrador) e já está visível na nossa plataforma!</p><p>Agradecemos por fazer parte da comunidade de empreendedores de Saquarema.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá.</strong></p>`,
        };
      } else if (
        statusOriginal === StatusEstabelecimento.PENDENTE_ATUALIZACAO
      ) {
        emailInfo = {
          subject: "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
          html: `<h1>Olá, ${estabelecimento.nomeResponsavel}!</h1><p>A sua solicitação para atualizar os dados do estabelecimento <strong>${estabelecimento.nomeFantasia}</strong> foi aprovada (com algumas edições do administrador).</p><p>As novas informações já estão visíveis para todos na plataforma.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá</strong></p>`,
        };
      }

      await transaction.commit();

      if (emailInfo && estabelecimento.emailEstabelecimento) {
        try {
          await EmailService.sendGenericEmail({
            to: estabelecimento.emailEstabelecimento,
            subject: emailInfo.subject,
            html: emailInfo.html,
          });
        } catch (error) {
          console.error(
            `Falha ao enviar email de notificação para ${estabelecimento.emailEstabelecimento}:`,
            error,
          );
        }
      }

      return res
        .status(200)
        .json({ message: "Estabelecimento editado e aprovado com sucesso." });
    } catch (error) {
      await transaction.rollback();
      console.error("ERRO DURANTE A EDIÇÃO E APROVAÇÃO:", error);
      return res
        .status(500)
        .json({ message: "Erro ao editar e aprovar a solicitação." });
    }
  }

  static async getAllActiveEstabelecimentos(req: Request, res: Response) {
    try {
      // Esta função chama o Service, que já está correto
      const estabelecimentos = await EstabelecimentoService.listarTodos();
      return res.json(estabelecimentos);
    } catch (error) {
      console.error(error);
      return res
        .status(500)
        .json({ message: "Erro ao buscar estabelecimentos ativos." });
    }
  }

  // ***** FUNÇÃO UNIFICADA (CHAMADA PELO DASHBOARD E PÁGINA DE ATIVOS) *****
  // Esta função agora é chamada tanto pelo Dashboard quanto pela página de Ativos
  // e sabe o que fazer em ambos os casos.
  static async adminUpdateEstabelecimento(req: Request, res: Response) {
    const { id } = req.params;
    const adminEditedData = req.body;

    // ***** CORREÇÃO 1: Fazer o parse do urlsParaExcluir (que vem como string JSON) *****
    let { urlsParaExcluir } = adminEditedData;
    if (urlsParaExcluir && typeof urlsParaExcluir === "string") {
      try {
        urlsParaExcluir = JSON.parse(urlsParaExcluir);
      } catch (e) {
        console.error(
          "Falha ao parsear urlsParaExcluir em adminUpdateEstabelecimento:",
          e,
        );
        urlsParaExcluir = [];
      }
    }
    // ***** FIM DA CORREÇÃO 1 *****

    const transaction = await sequelize.transaction();

    try {
      const estabelecimento = await Estabelecimento.findByPk(id, {
        transaction,
        // ***** CORREÇÃO DO ALIAS AQUI *****
        include: [{ model: ImagemProduto, as: "produtosImg" }], // <-- Este é o alias correto
      });

      if (!estabelecimento) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ message: "Estabelecimento não encontrado." });
      }

      // ****** LÓGICA COMBINADA (para Dashboard e Ativos) ******
      const statusOriginal = estabelecimento.status;
      const dadosRecebidos = (estabelecimento.dados_atualizacao || {}) as any;
      let emailInfo: { subject: string; html: string } | null = null;

      // 1. LÓGICA DE LOGO (UNIFICADA)
      // ***** CORREÇÃO 2: Corrigir o bug do hasOwnProperty E checar por "DELETE" *****
      if (
        "logoUrl" in adminEditedData &&
        (adminEditedData.logoUrl === "DELETE" ||
          adminEditedData.logoUrl === null)
      ) {
        // ***** FIM DA CORREÇÃO 2 *****
        const logoAntigaUrl = estabelecimento.logoUrl || dadosRecebidos.logo;
        if (logoAntigaUrl) {
          try {
            const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
            await fs.unlink(filePath);
            console.log(`Logo deletada: ${logoAntigaUrl}`);
          } catch (err) {
            console.error(
              `AVISO: Falha ao deletar logo: ${logoAntigaUrl}`,
              err,
            );
          }
        }
        adminEditedData.logoUrl = null;
      } else if (
        (statusOriginal === StatusEstabelecimento.PENDENTE_ATUALIZACAO ||
          statusOriginal === StatusEstabelecimento.PENDENTE_APROVACAO) &&
        dadosRecebidos.logo
      ) {
        // Admin está aprovando uma *nova* logo de uma pendência
        const logoAntigaUrl = estabelecimento.logoUrl;
        if (logoAntigaUrl) {
          try {
            const filePath = path.join(__dirname, "..", "..", logoAntigaUrl);
            await fs.unlink(filePath);
          } catch (err) {
            console.error(
              `AVISO: Falha ao deletar logo antiga: ${logoAntigaUrl}`,
              err,
            );
          }
        }
        adminEditedData.logoUrl = dadosRecebidos.logo;
      }

      // 2. LÓGICA DE IMAGENS DO PORTFÓLIO (UNIFICADA)
      if (
        (statusOriginal === StatusEstabelecimento.PENDENTE_ATUALIZACAO ||
          statusOriginal === StatusEstabelecimento.PENDENTE_APROVACAO) &&
        dadosRecebidos.imagens &&
        Array.isArray(dadosRecebidos.imagens) &&
        dadosRecebidos.imagens.length > 0
      ) {
        // Cenário: APROVANDO uma atualização de portfólio
        const imagensAntigas = await ImagemProduto.findAll({
          where: { estabelecimentoId: estabelecimento.estabelecimentoId },
          transaction,
        });

        for (const imagem of imagensAntigas) {
          try {
            const filePath = path.join(__dirname, "..", "..", imagem.url);
            await fs.unlink(filePath);
          } catch (err) {
            /* ... log ... */
          }
        }

        await ImagemProduto.destroy({
          where: { estabelecimentoId: estabelecimento.estabelecimentoId },
          transaction,
        });

        const imagensParaCriar = dadosRecebidos.imagens.filter(
          (url: string) => !(urlsParaExcluir && urlsParaExcluir.includes(url)),
        );

        const novasImagens = imagensParaCriar.map((url: string) => ({
          url,
          estabelecimentoId: estabelecimento.estabelecimentoId,
        }));
        await ImagemProduto.bulkCreate(novasImagens, { transaction });
      } else if (
        urlsParaExcluir &&
        Array.isArray(urlsParaExcluir) &&
        urlsParaExcluir.length > 0
      ) {
        // Cenário: APENAS DELETANDO imagens (de um MEI ativo ou pendente)
        const imagensParaDeletar = await ImagemProduto.findAll({
          where: {
            url: urlsParaExcluir,
            estabelecimentoId: estabelecimento.estabelecimentoId,
          },
          transaction,
        });

        for (const imagem of imagensParaDeletar) {
          try {
            const filePath = path.join(__dirname, "..", "..", imagem.url);
            await fs.unlink(filePath);
            console.log(`Imagem de portfólio deletada: ${imagem.url}`);
          } catch (err) {
            console.error(
              `AVISO: Falha ao deletar imagem de portfólio: ${imagem.url}`,
              err,
            );
          }
        }

        await ImagemProduto.destroy({
          where: { id: imagensParaDeletar.map((img) => img.id) },
          transaction,
        });
      }

      const updatePayload: any = {
        ...adminEditedData,
      };

      if (
        statusOriginal === StatusEstabelecimento.PENDENTE_APROVACAO ||
        statusOriginal === StatusEstabelecimento.PENDENTE_ATUALIZACAO
      ) {
        updatePayload.status = StatusEstabelecimento.ATIVO;
        updatePayload.ativo = true;
        updatePayload.dados_atualizacao = null;

        if (statusOriginal === StatusEstabelecimento.PENDENTE_APROVACAO) {
          emailInfo = {
            subject: "Seu cadastro no MeideSaquá foi Aprovado!",
            html: `<h1>Olá, ${estabelecimento.nomeResponsavel}!</h1> <p>Temos uma ótima notícia: o seu estabelecimento, <strong>${estabelecimento.nomeFantasia}</strong>, foi aprovado (com algumas edições do administrador) e já está visível na nossa plataforma!</p><p>Agradecemos por fazer parte da comunidade de empreendedores de Saquarema.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá.</strong></p>`,
          };
        } else {
          emailInfo = {
            subject:
              "Sua solicitação de atualização no MeideSaquá foi Aprovada!",
            html: `<h1>Olá, ${estabelecimento.nomeResponsavel}!</h1><p>A sua solicitação para atualizar os dados do estabelecimento <strong>${estabelecimento.nomeFantasia}</strong> foi aprovada (com algumas edições do administrador).</p><p>As novas informações já estão visíveis para todos na plataforma.</p><br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá</strong></p>`,
          };
        }
      }

      delete updatePayload.estabelecimentoId;
      delete updatePayload.urlsParaExcluir;
      // Precisamos checar com 'in' por causa do multer
      if ("dados_atualizacao" in updatePayload) {
        updatePayload.dados_atualizacao = null;
      }

      await estabelecimento.update(updatePayload, { transaction });
      await transaction.commit();

      if (emailInfo && estabelecimento.emailEstabelecimento) {
        try {
          await EmailService.sendGenericEmail({
            to: estabelecimento.emailEstabelecimento,
            subject: emailInfo.subject,
            html: emailInfo.html,
          });
          console.log(
            `Email de aprovação/atualização enviado para ${estabelecimento.emailEstabelecimento}`,
          );
        } catch (error) {
          console.error(
            `Falha ao enviar email de notificação para ${estabelecimento.emailEstabelecimento}:`,
            error,
          );
        }
      }

      return res
        .status(200)
        .json({ message: "Estabelecimento atualizado com sucesso." });
    } catch (error) {
      await transaction.rollback();
      console.error("ERRO DURANTE A ATUALIZAÇÃO ADMIN (UNIFICADA):", error);
      return res
        .status(500)
        .json({ message: "Erro ao atualizar o estabelecimento." });
    }
  }

  static adminDeleteEstabelecimento = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res
          .status(400)
          .json({ message: "ID do estabelecimento inválido." });
      }

      const estabelecimento = await Estabelecimento.findByPk(id);
      if (!estabelecimento) {
        return res
          .status(404)
          .json({ message: "Estabelecimento não encontrado." });
      }

      // TODO: Adicionar lógica para deletar arquivos (logo, imagens) ANTES do destroy
      await estabelecimento.destroy();

      return res.status(204).send();
    } catch (error: any) {
      console.error("Falha ao excluir estabelecimento (admin):", error);
      return res
        .status(500)
        .json({ message: "Erro interno ao excluir estabelecimento." });
    }
  };

  static async rejectRequest(req: Request, res: Response) {
    const { id } = req.params;
    const { motivoRejeicao } = req.body;
    const transaction = await sequelize.transaction();
    try {
      const estabelecimento = await Estabelecimento.findByPk(id, {
        transaction,
      });
      if (!estabelecimento) {
        await transaction.rollback();
        return res
          .status(404)
          .json({ message: "Estabelecimento não encontrado." });
      }

      let responseMessage = "Solicitação rejeitada com sucesso.";
      let emailInfo: { subject: string; html: string } | null = null;
      const emailParaNotificar = estabelecimento.emailEstabelecimento;
      const motivoHtml = motivoRejeicao
        ? `<p><strong>Motivo da Rejeição:</strong> ${motivoRejeicao}</p>`
        : "<p>Para mais detalhes, entre em contato conosco.</p>";

      if (estabelecimento.status === StatusEstabelecimento.PENDENTE_APROVACAO) {
        // TODO: Adicionar lógica para deletar arquivos (logo, imagens)
        await estabelecimento.destroy({ transaction });
        responseMessage = "Cadastro de estabelecimento rejeitado e removido.";

        emailInfo = {
          subject: "Seu cadastro no MeideSaquá foi Rejeitado",
          html: `<h1>Olá, ${estabelecimento.nomeResponsavel}.</h1><p>Lamentamos informar que o cadastro do estabelecimento <strong>${estabelecimento.nomeFantasia}</strong> não foi aprovado.</p>${motivoHtml}<br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá</strong></p>`,
        };
      } else if (
        estabelecimento.status === StatusEstabelecimento.PENDENTE_ATUALIZACAO ||
        estabelecimento.status === StatusEstabelecimento.PENDENTE_EXCLUSAO
      ) {
        const statusAnterior = estabelecimento.status;
        estabelecimento.status = StatusEstabelecimento.ATIVO;
        estabelecimento.dados_atualizacao = null;
        await estabelecimento.save({ transaction });

        // TODO: Adicionar lógica para deletar arquivos pendentes de atualização
        if (statusAnterior === StatusEstabelecimento.PENDENTE_ATUALIZACAO) {
          emailInfo = {
            subject:
              "Sua solicitação de atualização no MeideSaquá foi Rejeitada",
            html: `<h1>Olá, ${estabelecimento.nomeResponsavel}.</h1><p>Informamos que a sua solicitação para atualizar os dados do estabelecimento <strong>${estabelecimento.nomeFantasia}</strong> não foi aprovada.</p><p>Os dados anteriores foram mantidos.</p>${motivoHtml}<br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá</strong></p>`,
          };
        } else {
          emailInfo = {
            subject: "Sua solicitação de exclusão no MeideSaquá foi Rejeitada",
            html: `<h1>Olá, ${estabelecimento.nomeResponsavel}.</h1><p>Informamos que a sua solicitação para remover o estabelecimento <strong>${estabelecimento.nomeFantasia}</strong> não foi aprovada.</p><p>Seu estabelecimento continua ativo na plataforma.</p>${motivoHtml}<br><p>Atenciosamente,</p><p><strong>Equipe MeideSaquá</strong></p>`,
          };
        }
      } else {
        await transaction.rollback();
        return res.status(400).json({
          message:
            "O estabelecimento não está em um estado pendente para rejeição.",
        });
      }

      await transaction.commit();

      if (emailInfo && emailParaNotificar) {
        try {
          await EmailService.sendGenericEmail({
            to: emailParaNotificar,
            subject: emailInfo.subject,
            html: emailInfo.html,
          });
          console.log(
            `Email de rejeição enviado com sucesso para ${emailParaNotificar}`,
          );
        } catch (error) {
          console.error(
            `Falha ao enviar email de rejeição para ${emailParaNotificar}:`,
            error,
          );
        }
      }

      return res.status(200).json({ message: responseMessage });
    } catch (error) {
      await transaction.rollback();
      console.error("Erro ao rejeitar a solicitação:", error);
      return res
        .status(500)
        .json({ message: "Erro ao rejeitar a solicitação." });
    }
  }

  static async getAvaliacoesByEstabelecimento(req: Request, res: Response) {
    try {
      const { estabelecimentoId } = req.params;

      const estabelecimento = await Estabelecimento.findByPk(
        estabelecimentoId,
        {
          attributes: ["estabelecimentoId", "nomeFantasia", "categoria"], // Corrigido de nomeEstabelecimento
        },
      );

      if (!estabelecimento) {
        return res
          .status(404)
          .json({ message: "Estabelecimento não encontrado." });
      }

      const avaliacoes = await Avaliacao.findAll({
        where: { estabelecimentoId: estabelecimentoId, parent_id: null },
        include: [
          {
            model: Usuario,
            as: "usuario",
            attributes: ["usuarioId", "nomeCompleto", "email"],
          },
          {
            model: Avaliacao,
            as: "respostas",
            required: false,
            include: [
              {
                model: Usuario,
                as: "usuario",
                attributes: ["usuarioId", "nomeCompleto", "email"],
              },
            ],
          },
        ],
        order: [
          ["avaliacoesId", "DESC"],
          [{ model: Avaliacao, as: "respostas" }, "avaliacoesId", "ASC"],
        ],
      });

      return res.json({ estabelecimento, avaliacoes });
    } catch (error) {
      console.error(
        "Erro ao buscar avaliações por estabelecimento (admin):",
        error,
      );
      return res.status(500).json({ message: "Erro ao buscar avaliações." });
    }
  }

  static async adminDeleteAvaliacao(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const avaliacao = await Avaliacao.findByPk(id);

      if (!avaliacao) {
        return res.status(404).json({ message: "Avaliação não encontrada." });
      }

      await avaliacao.destroy();

      return res
        .status(200)
        .json({ message: "Avaliação excluída com sucesso." });
    } catch (error) {
      console.error("Erro ao excluir avaliação (admin):", error);
      return res.status(500).json({ message: "Erro ao excluir a avaliação." });
    }
  }

  static async exportActiveEstabelecimentos(req: Request, res: Response) {
    try {
      const estabelecimentos = await EstabelecimentoService.listarTodos();

      if (!estabelecimentos || estabelecimentos.length === 0) {
        return res
          .status(404)
          .json({ message: "Nenhum estabelecimento ativo para exportar." });
      }

      // Cabeçalhos do CSV
      const headers = [
        "ID",
        "Nome Fantasia",
        "CNPJ",
        "Categoria",
        "Responsável",
        "CPF Responsável",
        "Email",
        "Telefone",
        "Endereço",
        "CNAE",
        "Descrição",
        "Diferencial",
        "Tags Invisíveis",
        "Website",
        "Instagram",
        "Venda",
        "Escala",
        "Status",
      ];

      const SEPARATOR = ";";

      // Função auxiliar para escapar campos CSV
      const escapeCsvField = (field: any) => {
        if (field === null || field === undefined) return '""';
        const stringField = String(field);
        // Trata aspas, vírgulas e quebras de linha
        if (
          stringField.includes('"') ||
          stringField.includes(SEPARATOR) ||
          stringField.includes("\n")
        ) {
          return `"${stringField.replace(/"/g, '""')}"`;
        }
        return `"${stringField}"`;
      };

      // Monta o conteúdo do CSV
      let csvContent = headers.join(SEPARATOR) + "\n";

      estabelecimentos.forEach((est) => {
        const row = [
          est.estabelecimentoId,
          est.nomeFantasia,
          est.cnpj,
          est.categoria,
          est.nomeResponsavel,
          est.cpfResponsavel,
          est.emailEstabelecimento,
          est.contatoEstabelecimento,
          est.endereco,
          est.cnae,
          est.descricao,
          est.descricaoDiferencial,
          est.tagsInvisiveis,
          est.website,
          est.instagram,
          est.venda,
          est.escala,
          est.status,
          "",
        ];

        csvContent += row.map(escapeCsvField).join(SEPARATOR) + "\n";
      });

      // Configura os headers da resposta para download
      res.header("Content-Type", "text/csv; charset=utf-8");
      res.attachment("estabelecimentos_ativos_meidesaqua.csv");
      return res.status(200).send(csvContent);
    } catch (error) {
      console.error("Erro ao exportar estabelecimentos:", error);
      return res
        .status(500)
        .json({ message: "Erro ao gerar arquivo de exportação." });
    }
  }

  static async getDashboardStats(req: Request, res: Response) {
    try {
      // 1. Buscando dados básicos (mantido)
      const estabelecimentos = await Estabelecimento.findAll({
        where: { status: StatusEstabelecimento.ATIVO },
        attributes: ["estabelecimentoId", "categoria", "escala", "venda"],
      });

      const totalMeis = estabelecimentos.length;

      const avaliacoes = await Avaliacao.findAll({
        where: { parentId: null },
        attributes: ["nota"],
      });

      const totalAvaliacoes = avaliacoes.length;
      let somaNotas = 0;
      const distribuicaoNotas = [0, 0, 0, 0, 0];

      avaliacoes.forEach((a) => {
        if (a.nota) {
          somaNotas += a.nota;
          const notaIndex = Math.floor(a.nota) - 1;
          if (notaIndex >= 0 && notaIndex < 5) {
            distribuicaoNotas[notaIndex]++;
          }
        }
      });

      const mediaAvaliacao =
        totalAvaliacoes > 0 ? (somaNotas / totalAvaliacoes).toFixed(1) : 0;

      const chartDistribuicaoNotas = distribuicaoNotas.map((qtd, index) => ({
        nota: `${index + 1} Estrela${index !== 0 ? "s" : ""}`,
        qtd: qtd,
      }));

      // 2. Processamento dos Gráficos de Categoria, Escala e Vendas (mantido)
      const categoriasMap: { [key: string]: number } = {};
      const escalaMap: { [key: string]: number } = {};
      const vendasMap: { [key: string]: number } = {};

      estabelecimentos.forEach((e) => {
        // Categoria
        if (e.categoria) {
          const catNome =
            e.categoria.charAt(0).toUpperCase() +
            e.categoria.slice(1).toLowerCase();
          categoriasMap[catNome] = (categoriasMap[catNome] || 0) + 1;
        }
        // Escala
        const esc = e.escala ? e.escala.toString() : "0";
        const labelEscala = `Escala ${esc}`;
        escalaMap[labelEscala] = (escalaMap[labelEscala] || 0) + 1;
        // Vendas
        if (e.venda) {
          const canais = e.venda.split(",").map((v) => v.trim());
          canais.forEach((canal) => {
            if (canal) {
              const canalFormatado =
                canal.charAt(0).toUpperCase() + canal.slice(1).toLowerCase();
              vendasMap[canalFormatado] = (vendasMap[canalFormatado] || 0) + 1;
            }
          });
        }
      });

      const chartMeisPorCategoria = Object.entries(categoriasMap)
        .map(([categoria, qtd]) => ({ categoria, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 10);

      const chartEscalaNegocio = Object.entries(escalaMap)
        .map(([label, value]) => ({ label, value }))
        .sort(
          (a, b) =>
            parseInt(b.label.replace(/\D/g, "")) -
            parseInt(a.label.replace(/\D/g, "")),
        );

      const chartVendas = Object.entries(vendasMap)
        .map(([canal, qtd]) => ({ canal, qtd }))
        .sort((a, b) => b.qtd - a.qtd);

      // 3. Processamento de Visualizações e Cliques (ATUALIZADO)
      const totalUsuarios = await Usuario.count();
      const visualizacoesRaw = await ContadorVisualizacao.findAll();

      const pageViews = { home: 0, espacoMei: 0, categoriasTotal: 0 };
      const mapaVisualizacoes: { [key: string]: number } = {};
      const mapaCursos: { [key: string]: number } = {};

      // NOVOS CONTADORES ESPECÍFICOS
      const espacoMeiClicks = { gov: 0, wpp: 0, email: 0 };
      let perfilCompartilhado = 0;

      visualizacoesRaw.forEach((v) => {
        if (v.identificador === "HOME") {
          pageViews.home = v.visualizacoes;
        } else if (v.identificador === "ESPACO_MEI") {
          pageViews.espacoMei = v.visualizacoes;
        } else if (v.identificador.startsWith("CAT_")) {
          let nomeCat = v.identificador
            .replace("CAT_", "")
            .replace(/_/g, " ")
            .toLowerCase();
          nomeCat = nomeCat.charAt(0).toUpperCase() + nomeCat.slice(1);
          mapaVisualizacoes[nomeCat] = v.visualizacoes;
          pageViews.categoriasTotal += v.visualizacoes;
        } else if (v.identificador.startsWith("CURSO_")) {
          let nomeCurso = v.identificador
            .replace("CURSO_", "")
            .replace(/_/g, " ")
            .toLowerCase();
          nomeCurso = nomeCurso.charAt(0).toUpperCase() + nomeCurso.slice(1);
          mapaCursos[nomeCurso] = v.visualizacoes;
        }
        // --- LÓGICA NOVA PARA OS LINKS ---
        else if (v.identificador === "LINK_GOV") {
          espacoMeiClicks.gov = v.visualizacoes;
        } else if (v.identificador === "LINK_WPP") {
          espacoMeiClicks.wpp = v.visualizacoes;
        } else if (v.identificador === "LINK_EMAIL") {
          espacoMeiClicks.email = v.visualizacoes;
        } else if (v.identificador === "PROFILE_SHARE") {
          perfilCompartilhado = v.visualizacoes;
        }
      });

      const chartCursos = Object.entries(mapaCursos)
        .map(([curso, qtd]) => ({ curso, qtd }))
        .sort((a, b) => b.qtd - a.qtd);

      const chartVisualizacoesPorCategoria = Object.entries(mapaVisualizacoes)
        .map(([categoria, views]) => ({ categoria, views }))
        .sort((a, b) => b.views - a.views)
        .slice(0, 10);

      return res.json({
        totalMeis,
        totalUsuarios,
        totalAvaliacoes,
        mediaAvaliacao,
        chartMeisPorCategoria,
        chartVisualizacoesPorCategoria,
        chartDistribuicaoNotas,
        chartEscalaNegocio,
        pageViews,
        chartVendas,
        chartCursos,
        espacoMeiClicks,
        perfilCompartilhado,
      });
    } catch (error) {
      console.error("Erro dashboard:", error);
      return res.status(500).json({ message: "Erro ao buscar estatísticas." });
    }
  }

  // =========================================================================
  // GESTÃO DE USUÁRIOS
  // =========================================================================

  static async getAllUsers(req: Request, res: Response) {
    try {
      const usuarios = await Usuario.findAll({
        attributes: {
          exclude: ["password", "confirmationToken", "resetPasswordToken"],
        },
        order: [["usuarioId", "ASC"]],
      });
      return res.json(usuarios);
    } catch (error) {
      console.error("Erro ao buscar usuários (admin):", error);
      return res
        .status(500)
        .json({ message: "Erro ao buscar lista de usuários." });
    }
  }

  static async adminUpdateUser(req: Request, res: Response) {
    const { id } = req.params;
    const { nomeCompleto, email, username, enabled } = req.body;

    const transaction = await sequelize.transaction();

    try {
      const usuario = await Usuario.findByPk(id, { transaction });

      if (!usuario) {
        await transaction.rollback();
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const dadosAtualizacao: any = {};
      if (nomeCompleto !== undefined)
        dadosAtualizacao.nomeCompleto = nomeCompleto;
      if (email !== undefined) dadosAtualizacao.email = email;
      if (username !== undefined) dadosAtualizacao.username = username;
      if (enabled !== undefined) dadosAtualizacao.enabled = enabled;

      await usuario.update(dadosAtualizacao, { transaction });
      await transaction.commit();

      return res
        .status(200)
        .json({ message: "Usuário atualizado com sucesso." });
    } catch (error) {
      await transaction.rollback();
      console.error("Erro ao atualizar usuário (admin):", error);
      return res.status(500).json({ message: "Erro ao atualizar usuário." });
    }
  }

  static async adminDeleteUser(req: Request, res: Response) {
    const { id } = req.params;

    const transaction = await sequelize.transaction();

    try {
      const usuario = await Usuario.findByPk(id, { transaction });

      if (!usuario) {
        await transaction.rollback();
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const avaliacoesDoUsuario = await Avaliacao.findAll({
        where: { usuarioId: id },
        attributes: ["avaliacoesId"],
        transaction,
      });

      const idsAvaliacoes = avaliacoesDoUsuario.map((a) => a.avaliacoesId);

      if (idsAvaliacoes.length > 0) {
        await Avaliacao.destroy({
          where: { parentId: idsAvaliacoes },
          transaction,
        });

        await Avaliacao.destroy({
          where: { usuarioId: id },
          transaction,
        });
      }

      await usuario.destroy({ transaction });

      await transaction.commit();
      return res
        .status(200)
        .json({
          message: "Usuário e todos os seus dados vinculados foram excluídos.",
        });
    } catch (error) {
      await transaction.rollback();
      console.error("Erro ao excluir usuário (admin):", error);
      return res.status(500).json({ message: "Erro ao excluir usuário." });
    }
  }

  static async adminChangePassword(req: Request, res: Response) {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "A senha deve ter pelo menos 6 caracteres." });
    }

    try {
      const usuario = await Usuario.findByPk(id);

      if (!usuario) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);

      usuario.password = hashedPassword;
      usuario.resetPasswordToken = null;
      usuario.resetPasswordTokenExpiry = null;

      await usuario.save();

      return res.status(200).json({ message: "Senha alterada com sucesso." });
    } catch (error) {
      console.error("Erro ao alterar senha (admin):", error);
      return res.status(500).json({ message: "Erro ao alterar a senha." });
    }
  }

  static async resendConfirmationEmail(req: Request, res: Response) {
    const { id } = req.params;

    try {
      const usuario = await Usuario.findByPk(id);

      if (!usuario) {
        return res.status(404).json({ message: "Usuário não encontrado." });
      }

      if (usuario.enabled) {
        return res
          .status(400)
          .json({ message: "Este usuário já está confirmado e ativo." });
      }

      // Gera um novo token de confirmação
      const confirmationToken = crypto.randomBytes(20).toString("hex");
      usuario.confirmationToken = confirmationToken;
      await usuario.save();

      const confirmUrl = `${process.env.FRONTEND_URL}/confirmar-conta?token=${confirmationToken}`;

      const emailHtml = `
        <h1>Confirmação de Conta (Reenvio Admin)</h1>
        <p>Olá, ${usuario.nomeCompleto}.</p>
        <p>Um administrador solicitou o reenvio do seu link de confirmação.</p>
        <p>Por favor, confirme seu cadastro clicando no link abaixo:</p>
        <a href="${confirmUrl}" target="_blank">Confirmar minha conta</a>
        <p>Se você não solicitou isso, ignore este email.</p>
      `;

      await EmailService.sendGenericEmail({
        to: usuario.email,
        subject: "Confirme sua conta no MeideSaquá",
        html: emailHtml,
      });

      return res
        .status(200)
        .json({ message: "Email de confirmação reenviado com sucesso." });
    } catch (error) {
      console.error("Erro ao reenviar confirmação (admin):", error);
      return res
        .status(500)
        .json({ message: "Erro ao enviar email de confirmação." });
    }
  }
}
