const Sequelize = require('sequelize');
const sequelize = require('../config/database');
const Token = require('./token');

const Model = Sequelize.Model;

class User extends Model {}
User.init(
  {
    username: {
      type: Sequelize.STRING,
    },
    email: {
      type: Sequelize.STRING,
      unique: true,
    },
    password: {
      type: Sequelize.STRING,
    },
    inactive: {
      type: Sequelize.BOOLEAN,
      defaultValue: true,
    },
    activationToken: {
      type: Sequelize.STRING,
    },
    passwordResetToken: {
      type: Sequelize.STRING,
    },
    profileImage: {
      type: Sequelize.TEXT,
    },
  },
  { sequelize, modelName: 'user' }
);

User.hasMany(Token, { onDelete: 'cascade', foreignKey: 'userId' });

module.exports = User;
