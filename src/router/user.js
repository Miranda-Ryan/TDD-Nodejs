const express = require('express');
const UserService = require('../service/user');
const { check, validationResult } = require('express-validator');
const ValidationException = require('../errors/validationException');
const InvalidUserIdException = require('../errors/invalidUserIdException');
const ForbiddenException = require('../errors/forbiddenException');
const pagination = require('../middleware/pagination');
const { fromBuffer } = require('file-type');

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
    const authenticatedUser = req.authenticatedUser;
    const { page, size } = req.pagination;

    const users = await UserService.getUsers(page, size, authenticatedUser);
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

router.put(
  '/api/1.0/users/:id',
  check('username')
    .notEmpty()
    .withMessage('USERNAME_NULL')
    .bail()
    .isLength({ min: 4, max: 32 })
    .withMessage('USERNAME_LENGTH')
    .bail(),
  check('image').custom(async (fileInBase64) => {
    if (!fileInBase64) {
      return true;
    }
    const buffer = Buffer.from(fileInBase64, 'base64');
    if (buffer.length > 1024 * 1024 * 2) {
      throw new Error();
    }

    const type = await fromBuffer(buffer);
    if (!type) {
      throw new Error('UNSUPPORTED_FILE_TYPE');
    }
    const validType = ['image/jpeg', 'image/png'].includes(type.mime);
    if (!validType) {
      throw new Error('UNSUPPORTED_FILE_TYPE');
    }

    return true;
  }),
  async (req, res, next) => {
    const authenticatedUser = req.authenticatedUser;

    if (!authenticatedUser || authenticatedUser.id !== Number.parseInt(req.params.id)) {
      return next(new ForbiddenException());
    }

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }

    try {
      const user = await UserService.updateUser(req.params.id, req.body);
      res.send(user);

      res.status(400).send();
    } catch (error) {
      next(error);
    }
  }
);

router.delete('/api/1.0/users/:id', async (req, res, next) => {
  const authenticatedUser = req.authenticatedUser;

  if (!authenticatedUser || authenticatedUser.id !== Number.parseInt(req.params.id)) {
    return next(new ForbiddenException());
  }

  try {
    await UserService.deleteUser(authenticatedUser.id);
    res.send();
  } catch (error) {
    next(error);
  }
});

router.post(
  '/api/1.0/user/password-reset',
  check('email').notEmpty().withMessage('EMAIL_NULL').bail().isEmail().withMessage('EMAIL_INVALID').bail(),
  async (req, res, next) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return next(new ValidationException(errors.array()));
    }

    const { email } = req.body;

    try {
      await UserService.passwordResetRequest(email);
      res.send({ message: req.t('PASSWORD_RESET_REQUEST_SUCCESS') });
    } catch (error) {
      next(error);
    }
  }
);

router.put(
  '/api/1.0/user/password',
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
    try {
      const user = await UserService.validatePasswordResetToken(req.body.passwordResetToken);
      const errors = validationResult(req);
      if (!errors.isEmpty() && user) {
        return next(new ValidationException(errors.array()));
      }

      const { passwordResetToken, password } = req.body;
      await UserService.updatePassword(passwordResetToken, password);

      res.send();
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
