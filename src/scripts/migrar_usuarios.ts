// src/scripts/migrar_usuarios.ts
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../", ".env.local") });

import sequelize from "../config/database";
import { Estabelecimento, Usuario } from "../entities";

async function runMigration() {
  try {
    await sequelize.authenticate();
    console.log("Conectado ao banco. Iniciando migração de vínculos...");

    // Busca todos os estabelecimentos que ainda não têm um usuário vinculado
    const estabelecimentos = await Estabelecimento.findAll({
      where: { usuarioId: null },
    });

    console.log(
      `Encontrados ${estabelecimentos.length} estabelecimentos sem vínculo.`,
    );

    let vinculados = 0;

    for (const estab of estabelecimentos) {
      if (!estab.emailEstabelecimento) continue;

      // Procura um usuário que tenha o email igual ao email do estabelecimento
      const user = await Usuario.findOne({
        where: { email: estab.emailEstabelecimento },
      });

      if (user) {
        estab.usuarioId = user.usuarioId;
        await estab.save();
        console.log(
          `✅ [SUCESSO] Estabelecimento '${estab.nomeFantasia}' vinculado ao usuário ID ${user.usuarioId} (${user.nomeCompleto})`,
        );
        vinculados++;
      } else {
        console.log(
          `⚠️ [AVISO] Nenhum usuário encontrado para o email: ${estab.emailEstabelecimento}`,
        );
      }
    }

    console.log(
      `\nMigração concluída! Total de vínculos realizados: ${vinculados}`,
    );
    process.exit(0);
  } catch (error) {
    console.error("Erro durante a migração:", error);
    process.exit(1);
  }
}

runMigration();
