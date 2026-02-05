// Copie e cole TUDO isto no seu arquivo: src/entities/index.ts

import Usuario from "./Usuario.entity";
import Estabelecimento from "./Estabelecimento.entity";
import Avaliacao from "./Avaliacao.entity";
import ImagemProduto from "./ImagemProduto.entity";
import Curso from "./Curso.entity";
import ContadorVisualizacao from "./ContadorVisualizacao.entity";

Usuario.hasMany(Avaliacao, { foreignKey: "usuarioId", as: "avaliacoes" });
Avaliacao.belongsTo(Usuario, { foreignKey: "usuarioId", as: "usuario" });

Estabelecimento.hasMany(Avaliacao, {
  foreignKey: "estabelecimentoId",
  as: "avaliacoes",
});
Avaliacao.belongsTo(Estabelecimento, {
  foreignKey: "estabelecimentoId",
  as: "estabelecimento",
});

Estabelecimento.hasMany(ImagemProduto, {
  foreignKey: "estabelecimentoId",
  as: "produtosImg",
});
ImagemProduto.belongsTo(Estabelecimento, { foreignKey: "estabelecimentoId" });

Avaliacao.hasMany(Avaliacao, {
  foreignKey: "parentId",
  as: "respostas",
  onDelete: "CASCADE",
});

Avaliacao.belongsTo(Avaliacao, {
  foreignKey: "parentId",
  as: "pai",
});

export {
  Usuario,
  Estabelecimento,
  Avaliacao,
  ImagemProduto,
  ContadorVisualizacao,
  Curso,
};
