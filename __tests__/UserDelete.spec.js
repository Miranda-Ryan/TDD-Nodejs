const request = require('supertest');
const app = require('../src/app');
const User = require('../src/model/user');
const sequelize = require('../src/config/database');
const bcrypt = require('bcrypt');
const Token = require('../src/model/token');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await User.destroy({ truncate: { cascade: true } });
  await Token.destroy({ truncate: true });
});

afterAll(async () => {
  await sequelize.close();
});

const validUser = { username: 'user1', email: 'user1@xyz.com', password: 'test1234', inactive: false };

const addUser = async (user = { ...validUser }) => {
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;

  return User.create(user);
};

const auth = async (authOptions) => {
  const response = await request(app).post('/api/1.0/auth').send(authOptions);
  const token = response.body.token;

  return token;
};

const deleteUser = async (id = 1, options = {}) => {
  let agent = request(app);
  let token;

  // Get token
  if (options.auth) {
    token = await auth(options.auth);
  }

  agent = request(app).delete('/api/1.0/users/' + id);
  if (options.language) {
    agent.set('accept-language', options.language);
  }
  // Set token
  if (token) {
    agent.set('Authorization', `Bearer ${token}`);
  }

  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }

  return agent.send();
};

describe('User Delete', () => {
  it('returns 403 when request is sent without authorization', async () => {
    const response = await deleteUser();
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${'en'}  | ${'You are not authorized to perform this action'}
    ${'de'}  | ${'Sie sind nicht berechtigt, diese Aktion auszuführen'}
  `(
    'returns forbidden access message and error body when trying to update user without authorization',
    async ({ language, message }) => {
      const timeNow = new Date().getTime();
      const response = await deleteUser(5, { language });
      expect(response.body.message).toBe(message);
      expect(response.body.timestamp).toBeGreaterThan(timeNow);
      expect(response.body.path).toBe('/api/1.0/users/5');
      expect(Object.keys(response.body)).toEqual(['path', 'timestamp', 'message']);
    }
  );

  it('returns forbidden when request sent with correct credentials in token authorization but for different account', async () => {
    const user = await addUser();
    const userToBeUpdated = await addUser({ ...validUser, username: 'user2', email: 'user2@xyz.com' });
    const response = await deleteUser(userToBeUpdated.id, { auth: { email: user.email, password: user.password } });
    expect(response.status).toBe(403);
  });

  it('returns forbidden when request sent by inactive user with correct credentials in token authorization for their own account', async () => {
    const user = await addUser({ ...validUser, inactive: true });
    const response = await deleteUser(user.id, { auth: { email: user.email, password: user.password } });
    expect(response.status).toBe(403);
  });

  it('returns 403 when token is not valid', async () => {
    const response = await deleteUser(5, { token: '123' });
    expect(response.status).toBe(403);
  });

  it('returns 200 OK when valid delete request sent from authorized user', async () => {
    const savedUser = await addUser();
    const response = await deleteUser(savedUser.id, {
      auth: { email: validUser.email, password: validUser.password },
    });
    expect(response.status).toBe(200);
  });

  it('deletes user in database when valid delete request is sent from authorized user', async () => {
    const savedUser = await addUser();
    await deleteUser(savedUser.id, {
      auth: { email: validUser.email, password: validUser.password },
    });
    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    const dbUsers = await User.findAll();
    expect(inDBUser).toBeNull();
    expect(dbUsers.length).toBe(0);
  });

  it('deletes token after user is deleted when valid delete request is sent from authorized user', async () => {
    const savedUser = await addUser();
    await deleteUser(savedUser.id, {
      auth: { email: validUser.email, password: validUser.password },
    });

    const token = await Token.findOne({ where: { userId: savedUser.id } });
    expect(token).toBeNull();
  });

  it('deletes all tokens after user is deleted when valid delete request is sent from authorized user', async () => {
    const savedUser = await addUser();
    const token1 = await auth({ email: 'user1@xyz.com', password: 'test1234' });
    const token2 = await auth({ email: 'user1@xyz.com', password: 'test1234' });

    await deleteUser(savedUser.id, {
      auth: { email: validUser.email, password: validUser.password },
    });

    const tokens = await Token.findAll({ where: { userId: savedUser.id } });
    expect(tokens.length).toBe(0);
  });
});
