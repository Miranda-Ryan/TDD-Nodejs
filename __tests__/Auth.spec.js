const request = require('supertest');
const app = require('../src/app');
const User = require('../src/model/user');
const sequelize = require('../src/config/database');
const bcrypt = require('bcrypt');

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await User.destroy({ truncate: true });
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

describe('Authentication', () => {
  it('returns 200 OK when user credentials are correct when logging in', async () => {
    await addUser();
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    expect(response.status).toBe(200);
  });

  it('returns only id and username when login is successful', async () => {
    const user = await addUser();
    const response = await login({ email: 'user1@xyz.com', password: 'test1234' });

    const responseUser = response.body;
    expect(Object.keys(responseUser)).toEqual(['id', 'username']);
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
});
