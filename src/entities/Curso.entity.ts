import { Model, DataTypes } from "sequelize";
import sequelize from "../config/database";

class Curso extends Model {
  public id!: number;
  public titulo!: string;
  public link!: string;
  public imagemUrl!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Curso.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    titulo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    link: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    imagemUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: "cursos",
  },
);

export default Curso;
