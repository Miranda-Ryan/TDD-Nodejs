const express = require('express');
const UserService = require('../service/user');
const { check, validationResult } = require('express-validator');
const AuthenticationException = require('../errors/authenticationException');
const ForbiddenException = require('../errors/forbiddenException');
const bcrypt = require('bcrypt');

const router = express.Router();

router.post('/api/1.0/auth', check('email').isEmail().bail(), check('password').notEmpty(), async (req, res, next) => {
  const { email, password } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AuthenticationException());
  }

  const user = await UserService.findByEmail(email);
  if (!user) {
    return next(new AuthenticationException());
  }

  const match = await bcrypt.compare(password, user.password);
  if (!match) {
    return next(new AuthenticationException());
  }

  if (user.inactive) {
    return next(new ForbiddenException());
  }

  res.send({ id: user.id, username: user.username });
});

module.exports = router;
