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

const putUser = async (id = 5, body = null, options = {}) => {
  let agent = request(app);
  let token;

  // Get token
  if (options.auth) {
    const response = await agent.post('/api/1.0/auth').send(options.auth);
    token = response.body.token;
  }

  agent = request(app).put('/api/1.0/users/' + id);
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

  return agent.send(body);
};

describe('User Update', () => {
  it('returns 403 when request send without basic authorization', async () => {
    const response = await putUser();
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
      const response = await putUser(5, null, { language });

      expect(response.body.message).toBe(message);
      expect(response.body.timestamp).toBeGreaterThan(timeNow);
      expect(response.body.path).toBe('/api/1.0/users/5');
      expect(Object.keys(response.body)).toEqual(['path', 'timestamp', 'message']);
    }
  );

  it('returns forbidden when request sent with incorrect email in basic authorization', async () => {
    await addUser();
    const response = await putUser(5, null, { auth: { email: 'user1000@xuz.com', password: 'test1234' } });

    expect(response.status).toBe(403);
  });

  it('returns forbidden when request sent with incorrect password in basic authorization', async () => {
    await addUser();
    const response = await putUser(5, null, { auth: { email: 'user1@xyz.com', password: 'abv234w3' } });

    expect(response.status).toBe(403);
  });

  it('returns forbidden when request sent with correct credentials in basic authorization but for different account', async () => {
    const user = await addUser();
    const userToBeUpdated = await addUser({ ...validUser, username: 'user2', email: 'user2@xyz.com' });
    const response = await putUser(userToBeUpdated.id, null, { auth: { email: user.email, password: user.password } });

    expect(response.status).toBe(403);
  });

  it('returns forbidden when request sent by inactive user with correct credentials in basic authorization for their own account', async () => {
    const user = await addUser({ ...validUser, inactive: true });
    const response = await putUser(user.id, null, { auth: { email: user.email, password: user.password } });

    expect(response.status).toBe(403);
  });

  it('returns 200 OK when valid update request sent from authorized user', async () => {
    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated' };

    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: validUser.email, password: validUser.password },
    });

    expect(response.status).toBe(200);
  });

  it('updates username in database when valid update request is sent from authorized user', async () => {
    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated' };

    await putUser(savedUser.id, validUpdate, {
      auth: { email: validUser.email, password: validUser.password },
    });

    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.username).toBe(validUpdate.username);
  });

  it('returns 403 when token is not valid', async () => {
    const response = await putUser(5, null, { token: '123' });
    expect(response.status).toBe(403);
  });
});
