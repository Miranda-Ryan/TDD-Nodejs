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

const addUser = async (inactive = false) => {
  const user = { username: 'user1', email: 'user1@xyz.com', password: 'test1234', inactive };
  const hash = await bcrypt.hash(user.password, 10);
  user.password = hash;

  return User.create(user);
};

const login = async (credentials, options = {}) => {
  let agent = request(app).post('/api/1.0/auth');
  if (options.language) {
    agent.set('accept-language', options.language);
  }
  return agent.send(credentials);
};

const logout = async (options = {}) => {
  let agent = request(app).post('/api/1.0/logout');
  if (options.token) {
    agent.set('Authorization', `Bearer ${options.token}`);
  }
  return agent.send();
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

describe('Authentication', () => {
  it('returns 200 OK when user credentials are correct when logging in', async () => {
    await addUser();
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    expect(response.status).toBe(200);
  });

  it('returns only id, username and token when login is successful', async () => {
    const user = await addUser();
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    const responseUser = response.body;
    expect(Object.keys(responseUser)).toEqual(['id', 'username', 'token']);
    expect(responseUser.id).toBe(user.id);
    expect(responseUser.username).toBe(user.username);
  });

  it('returns 401 when user does not exist', async () => {
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    expect(response.status).toBe(401);
  });

  it('returns proper error body when authentication fails', async () => {
    const timeNow = new Date().getTime();
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    const error = response.body;
    expect(error.path).toBe('/api/1.0/auth');
    expect(error.timestamp).toBeGreaterThan(timeNow);
    expect(Object.keys(error)).toEqual(['path', 'timestamp', 'message']);
  });

  it.each`
    language | message
    ${'en'}  | ${'Incorrect credentials'}
    ${'de'}  | ${'Falsche Anmeldeinformationen'}
  `('returns message $message when authentication fails in $language language', async ({ language, message }) => {
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' }, { language });

    expect(response.body.message).toBe(message);
  });

  it('returns 401 when password is incorrect', async () => {
    await addUser();
    const response = await login({ email: 'user1@xyz.com', password: 'test12' });

    expect(response.status).toBe(401);
  });

  it('returns 403 when logging in with an inactive account', async () => {
    const inactive = true;
    await addUser(inactive);
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${'en'}  | ${'You are not authorized to perform this action'}
    ${'de'}  | ${'Sie sind nicht berechtigt, diese Aktion auszuführen'}
  `('returns forbidden access message when logging in with an inactive account', async ({ language, message }) => {
    const inactive = true;
    await addUser(inactive);
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' }, { language });

    expect(response.body.message).toBe(message);
  });

  it('returns 401 when email is invalid', async () => {
    await addUser();
    const response = await login({ email: 'user1xyz.com', password: 'test1234' });

    expect(response.status).toBe(401);
  });

  it('returns 401 when email is null', async () => {
    await addUser();
    const response = await login({ password: 'test1234' });

    expect(response.status).toBe(401);
  });

  it('returns 401 when password is null', async () => {
    await addUser();
    const response = await login({ email: 'user1@xyz.com' });

    expect(response.status).toBe(401);
  });

  it('returns token in response body when credentials are correct', async () => {
    await addUser();
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    expect(response.body.token).not.toBeUndefined();
  });
});

describe('Logout', () => {
  it('returns 200 OK when unauthorized request is sent for logout', async () => {
    const response = await logout();
    expect(response.status).toBe(200);
  });

  it('removes the token from database', async () => {
    await addUser();
    const getUser = await login({ email: 'user1@xyz.com', password: 'test1234' });
    const token = getUser.body.token;

    await logout({ token });
    const storedToken = await Token.findOne({ where: { token } });
    expect(storedToken).toBeNull();
  });
});

describe('Token Expiration', () => {
  it('returns 403 when token is older than 1 week', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000 - 1000);

    await Token.create({ token, userId: savedUser.id, lastUsedAt: oneWeekAgo });

    const validUpdate = { username: 'user1-updated' };
    const response = await putUser(savedUser.id, validUpdate, { token });
    expect(response.status).toBe(403);
  });

  it('refreshes lastUsedAt when unexpired token is used', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

    await Token.create({ token, userId: savedUser.id, lastUsedAt: fourDaysAgo });

    const validUpdate = { username: 'user1-updated' };
    const timeBeforeSendingRequest = new Date().getTime();

    await putUser(savedUser.id, validUpdate, { token });
    const tokenInDB = await Token.findOne({ where: { token } });
    expect(new Date(tokenInDB.lastUsedAt).getTime()).toBeGreaterThan(timeBeforeSendingRequest);
  });

  it('refreshes lastUsedAt when unexpired token is used for unauthenticated endpoint', async () => {
    const savedUser = await addUser();

    const token = 'test-token';
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);

    await Token.create({ token, userId: savedUser.id, lastUsedAt: fourDaysAgo });

    const timeBeforeSendingRequest = new Date().getTime();

    await request(app).get('/api/1.0/users/5').set('Authorization', `Bearer ${token}`);
    const tokenInDB = await Token.findOne({ where: { token } });
    expect(new Date(tokenInDB.lastUsedAt).getTime()).toBeGreaterThan(timeBeforeSendingRequest);
  });
});
