const express = require('express');
const UserService = require('../service/user');

const router = express.Router();

router.post('/api/1.0/users', async (req, res) => {
  await UserService.saveUser(req.body);

  return res.send({ message: 'User created' });
});

module.exports = router;
