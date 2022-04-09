const express = require('express');
const UserService = require('../service/user');
const { check, validationResult } = require('express-validator');
const ValidationException = require('../errors/validationException');
const InvalidUserIdException = require('../errors/invalidUserIdException');
const pagination = require('../middleware/pagination');

const router = express.Router();

router.post(
  '/api/1.0/users',
  check('username')
    .notEmpty()
    .withMessage('USERNAME_NULL')
    .bail()
    .isLength({ min: 4, max: 32 })
    .withMessage('USERNAME_LENGTH'),
  check('email')
    .notEmpty()
    .withMessage('EMAIL_NULL')
    .bail()
    .isEmail()
    .withMessage('EMAIL_INVALID')
    .bail()
    .custom(async (email) => {
      const user = await UserService.findByEmail(email);

      if (user) {
        throw new Error('EMAIL_IN_USE');
      }
    }),
  check('password')
    .notEmpty()
    .withMessage('PASSWORD_NULL')
    .bail()
    .isLength({ min: 6 })
    .withMessage('PASSWORD_LENGTH')
    .bail()
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/)
    .withMessage('PASSWORD_PATTERN'),
  async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }

    try {
      await UserService.saveUser(req.body);
      return res.send({ message: req.t('USER_CREATED') });
    } catch (error) {
      next(error);
    }
  }
);

router.post('/api/1.0/users/token/:token', async (req, res, next) => {
  const { token } = req.params;

  try {
    await UserService.activate(token);

    return res.send({ message: req.t('ACCOUNT_ACTIVATED') });
  } catch (error) {
    next(error);
  }
});

router.get('/api/1.0/users', pagination, async (req, res, next) => {
  try {
    const { page, size } = req.pagination;

    const users = await UserService.getUsers(page, size);
    res.send({ users });
  } catch (error) {
    next(error);
  }
});

router.get('/api/1.0/users/:id', async (req, res, next) => {
  try {
    const id = Number.parseInt(req.params.id);

    const invalidId = Number.isNaN(id);
    if (invalidId) {
      throw new InvalidUserIdException();
    }
    const user = await UserService.getUser(id);

    res.send(user);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
