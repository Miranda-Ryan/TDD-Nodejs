const bcrypt = require('bcrypt');
const User = require('../model/user');

const saveUser = async (body) => {
  const password = body.password;
  const hash = await bcrypt.hash(password, 10);
  const user = { ...body, password: hash };

  await User.create(user);
};

module.exports = {
  saveUser,
};
