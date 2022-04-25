const Sequelize = require('sequelize');
const { randomString } = require('../shared/generator');
const Token = require('../model/token');

const ONE_WEEK_AGO_IN_MILLIS = 7 * 24 * 60 * 60 * 1000;

const createToken = async (user) => {
  const token = await randomString(32);
  await Token.create({ token, userId: user.id, lastUsedAt: new Date() });
  return token;
};

const verify = async (token) => {
  const oneWeekAgo = new Date(Date.now() - ONE_WEEK_AGO_IN_MILLIS);
  const tokenInDb = await Token.findOne({ where: { token: token, lastUsedAt: { [Sequelize.Op.gt]: oneWeekAgo } } });
  tokenInDb.lastUsedAt = new Date();
  await tokenInDb.save();

  const userId = tokenInDb.userId;

  return { id: userId };
};

const deleteToken = async (token) => {
  await Token.destroy({ where: { token: token } });
};

const scheduleCleanup = () => {
  setInterval(async () => {
    const oneWeekAgo = new Date(Date.now() - ONE_WEEK_AGO_IN_MILLIS);
    await Token.destroy({ where: { lastUsedAt: { [Sequelize.Op.lt]: oneWeekAgo } } });
  }, 60 * 60 * 1000);
};

const clearTokens = async (userId) => {
  await Token.destroy({ where: { userId } });
};

module.exports = { createToken, verify, deleteToken, scheduleCleanup, clearTokens };
