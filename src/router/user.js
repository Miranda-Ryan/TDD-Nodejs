const express = require('express');
const UserService = require('../service/user');
const { check, validationResult } = require('express-validator');

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
  async (req, res) => {
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      const validationErrors = {};
      errors.array().forEach((error) => {
        validationErrors[error.param] = req.t(error.msg);
      });

      return res.status(400).json({
        validationErrors,
      });
    }

    try {
      await UserService.saveUser(req.body);
      return res.send({ message: req.t('USER_CREATED') });
    } catch (error) {
      return res.status(502).json({
        message: req.t(error.message),
      });
    }
  }
);

router.post('/api/1.0/users/token/:token', async (req, res) => {
  const { token } = req.params;

  try {
    await UserService.activate(token);

    return res.send({ message: req.t('ACCOUNT_ACTIVATED') });
  } catch (error) {
    return res.status(400).json({ message: req.t(error.message) });
  }
});

module.exports = router;
