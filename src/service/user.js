const bcrypt = require('bcrypt');
const User = require('../model/user');
const EmailService = require('./email');
const sequelize = require('../config/database');
const EmailException = require('../errors/emailException');
const InvalidTokenException = require('../errors/invalidTokenException');
const NotFoundException = require('../errors/notFoundException');
const ForbiddenException = require('../errors/forbiddenException');
const Sequelize = require('sequelize');
const TokenService = require('./token');
const FileService = require('./file');

const { randomString } = require('../shared/generator');

const saveUser = async (body) => {
  const { username, email, password } = body;

  const hash = await bcrypt.hash(password, 10);
  const activationToken = await randomString(16);
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

const getUsers = async (page, pageSize, authenticatedUser) => {
  const users = await User.findAndCountAll({
    where: { inactive: false, id: { [Sequelize.Op.not]: authenticatedUser ? authenticatedUser.id : 0 } },
    limit: pageSize,
    attributes: ['id', 'username', 'email', 'profileImage'],
    offset: (page - 1) * pageSize,
  });

  const totalPages = Math.ceil(users.count / pageSize);

  return { content: users.rows, page, size: pageSize, totalPages };
};

const getUser = async (id) => {
  const user = await User.findOne({
    where: { id, inactive: false },
    attributes: ['id', 'username', 'email', 'profileImage'],
  });
  if (!user) {
    throw new NotFoundException('USER_NOT_FOUND');
  }

  return user;
};

const updateUser = async (id, body) => {
  const user = await User.findOne({ where: { id } });
  user.username = body.username;

  const oldImage = user.profileImage;

  if (body.image) {
    const fileName = await FileService.saveProfileImage(body.image);
    user.profileImage = fileName;

    if (oldImage) {
      await FileService.deleteProfileImage(oldImage);
    }
  }

  await user.save();

  return {
    id,
    username: user.username,
    email: user.email,
    profileImage: user.profileImage,
  };
};

const deleteUser = async (id) => {
  await User.destroy({ where: { id } });
};

const passwordResetRequest = async (email) => {
  const user = await findByEmail(email);
  if (!user) {
    throw new NotFoundException('EMAIL_NOT_FOUND');
  }

  const passwordResetToken = await randomString(16);
  user.passwordResetToken = passwordResetToken;
  await user.save();

  try {
    await EmailService.sendPasswordResetToken(user.email, user.passwordResetToken);
  } catch (error) {
    throw new EmailException();
  }
};

const validatePasswordResetToken = async (token) => {
  const user = await User.findOne({ where: { passwordResetToken: token } });
  if (!user) {
    throw new ForbiddenException('UNAUTHORIZED_PASSWORD_RESET');
  }

  return user;
};

const updatePassword = async (passwordResetToken, password) => {
  const user = await User.findOne({ where: { passwordResetToken } });
  const hash = await bcrypt.hash(password, 10);
  user.password = hash;
  user.passwordResetToken = null;
  await user.save();

  await TokenService.clearTokens(user.id);
};

module.exports = {
  saveUser,
  activate,
  findByEmail,
  getUsers,
  getUser,
  updateUser,
  deleteUser,
  passwordResetRequest,
  validatePasswordResetToken,
  updatePassword,
};
