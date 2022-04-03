const bcrypt = require('bcrypt');
const User = require('../model/user');

const saveUser = async (body) => {
  const password = body.password;
  const hash = await bcrypt.hash(password, 10);
  const user = { ...body, password: hash };

  await User.create(user);
};

const findByEmail = async (email) => {
  const user = await User.findOne({ where: { email } });
  return user;
};

module.exports = {
  saveUser,
  findByEmail,
};
