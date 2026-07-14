import { DataTypes, Model } from "sequelize";
import sequelize from "../config/database";

class Curso extends Model {
  public cursoId!: number;
  public nome!: string;
  public descricao!: string | null;
  public link!: string | null;
  public imagemUrl!: string | null;
  public ativo!: boolean;
}

Curso.init(
  {
    cursoId: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
      field: "curso_id",
    },
    nome: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    descricao: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    link: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    imagemUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "imagem_url",
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    sequelize,
    tableName: "cursos",
    timestamps: true,
  },
);

export default Curso;