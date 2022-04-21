const jwt = require('jsonwebtoken');
const TokenService = require('../service/token');

const tokenAuthentication = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (authorization) {
    const token = authorization.substring(7);
    try {
      const user = await TokenService.verify(token);

      req.authenticatedUser = user;
    } catch (error) {
      // eslint-disable-next-line no-empty
    }
  }
  next();
};

module.exports = tokenAuthentication;
