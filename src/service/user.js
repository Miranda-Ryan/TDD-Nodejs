const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../model/user');
const EmailService = require('./email');
const sequelize = require('../config/database');
const EmailException = require('../errors/emailException');
const InvalidTokenException = require('../errors/invalidTokenException');

const generateToken = async (length) => {
  return crypto.randomBytes(length).toString('hex').substring(0, length);
};

const saveUser = async (body) => {
  const { username, email, password } = body;

  const hash = await bcrypt.hash(password, 10);
  const activationToken = await generateToken(16);
  const user = { username, email, password: hash, activationToken };

  // Create transaction
  // Either it will send email and commit user successfully
  // Or rollback and remove user
  const transaction = await sequelize.transaction();

  await User.create(user, { transaction });

  try {
    await EmailService.sendActivationToken(email, activationToken);
    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw new EmailException();
  }
};

const activate = async (token) => {
  const user = await User.findOne({ where: { activationToken: token } });

  if (!user) {
    throw new InvalidTokenException();
  }
  user.inactive = false;
  user.activationToken = null;
  await user.save();
};

const findByEmail = async (email) => {
  const user = await User.findOne({ where: { email } });
  return user;
};

module.exports = {
  generateToken,
  saveUser,
  activate,
  findByEmail,
};
