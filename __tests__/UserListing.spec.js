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

const validUser = {
  username: 'user1',
  email: 'user1@xyz.com',
  password: 'test1234',
};

const getUsers = async (page, pageSize, options = {}) => {
  const queryOptions = {
    page,
    pageSize,
  };
  const agent = request(app).get('/api/1.0/users').query(queryOptions);

  if (options.auth) {
    const { email, password } = options.auth;
    agent.auth(email, password);
  }

  return agent;
};

const addUsers = async (activeUsers = 10, inactiveUsers = 0) => {
  let i = 0;
  const hash = await bcrypt.hash('test1234', 10);
  for (i; i < activeUsers; i++) {
    await User.create({ username: `user${i}`, email: `user${i}@xyz.com`, password: hash, inactive: false });
  }

  for (i; i < inactiveUsers; i++) {
    await User.create({ username: `user${i}`, email: `user${i}@xyz.com`, password: hash });
  }
};

describe('Listing Users', () => {
  it('returns 200 OK when there are no users in the database', async () => {
    const response = await getUsers();
    expect(response.status).toBe(200);
  });

  it('returns 10 users on page content when there are 11 users in database', async () => {
    await addUsers(10);

    const response = await getUsers();
    const { users } = response.body;
    expect(users.content.length).toBe(10);
  });

  it('returns only active users when there are 11 users in total', async () => {
    await addUsers(5, 6);

    const response = await getUsers();
    const { users } = response.body;
    expect(users.content.length).toBe(5);
  });

  it('returns only id, username and email for each user in content array', async () => {
    await addUsers(2);

    const response = await getUsers();
    const user = response.body.users.content[0];
    expect(Object.keys(user)).toEqual(['id', 'username', 'email']);
  });

  it('returns 2 total pages when there are 15 users in database', async () => {
    await addUsers(15);

    const response = await getUsers();
    const { totalPages } = response.body.users;

    expect(totalPages).toBe(2);
  });

  it('returns 2 total pages when there are 15 active and 7 inactive users in database', async () => {
    await addUsers(15, 7);

    const response = await getUsers();
    const { totalPages } = response.body.users;

    expect(totalPages).toBe(2);
  });

  it('returns first page and page indicator by default when no page is passed in request query', async () => {
    await addUsers(15, 7);

    const response = await getUsers();
    const { page, content } = response.body.users;

    expect(content[0].username).toBe('user0');
    expect(page).toBe(1);
  });

  it('returns second page of users and page indicator when page is set as 2 in request query', async () => {
    await addUsers(15, 7);

    const requestPage = 2;
    const response = await getUsers(requestPage);
    const { page, content } = response.body.users;

    expect(content[0].username).toBe('user10');
    expect(page).toBe(2);
  });

  it(`returns 5 users, corresponding page indicator and corresponding totalPages 
      when page size is set as 5 and page is set as 2 in request query`, async () => {
    await addUsers(15, 7);

    const requestPage = 2;
    const pageSize = 5;
    const response = await getUsers(requestPage, pageSize);
    const { page, content, totalPages } = response.body.users;

    expect(content.length).toBe(5);
    expect(page).toBe(2);
    expect(totalPages).toBe(3);
    expect(content[0].username).toBe('user5');
  });

  it(`returns 5 users, corresponding page indicator and corresponding totalPages 
  when page size is set as 5 and page is set to default in request query`, async () => {
    await addUsers(15, 7);

    const pageSize = 5;
    const response = await getUsers(null, pageSize);
    const { page, content, totalPages } = response.body.users;

    expect(content.length).toBe(5);
    expect(page).toBe(1);
    expect(totalPages).toBe(3);
    expect(content[0].username).toBe('user0');
  });

  it(`returns 10 users, 1 as page indicator and corresponding totalPages 
  when page size is set as 0 and page is set to -1 in request query`, async () => {
    await addUsers(15, 7);

    const requestPage = -1;
    const pageSize = 0;
    const response = await getUsers(requestPage, pageSize);
    const { page, content, totalPages } = response.body.users;

    expect(content.length).toBe(10);
    expect(page).toBe(1);
    expect(totalPages).toBe(2);
    expect(content[0].username).toBe('user0');
  });

  it(`returns 10 users, corresponding page indicator and corresponding totalPages 
  when page size is set as 2000 in request query when there are 15 active users in DB`, async () => {
    await addUsers(15, 7);

    const pageSize = 2000;
    const response = await getUsers(null, pageSize);
    const { page, content, totalPages } = response.body.users;

    expect(content.length).toBe(10);
    expect(page).toBe(1);
    expect(totalPages).toBe(2);
    expect(content[0].username).toBe('user0');
  });

  it(`returns 10 users, 1 as page indicator and corresponding totalPages 
  when page size and page are set as non-numeric in request query`, async () => {
    await addUsers(15, 7);

    const requestPage = 'page';
    const pageSize = 'pageSize';
    const response = await getUsers(requestPage, pageSize);
    const { page, content, totalPages } = response.body.users;

    expect(content.length).toBe(10);
    expect(page).toBe(1);
    expect(totalPages).toBe(2);
  });

  it('returns user page without logged in user when request has valid authorization', async () => {
    await addUsers(11);
    const response = await getUsers(null, null, { auth: { email: 'user1@xyz.com', password: 'test1234' } });
    expect(response.body.users.totalPages).toBe(1);
  });

  it('returns 404 when user is not found', async () => {
    const response = await request(app).get('/api/1.0/users/5');
    expect(response.status).toBe(404);
  });

  it.each`
    language | message
    ${'en'}  | ${'User not found'}
    ${'de'}  | ${'Benutzer wurde nicht gefunden'}
  `('returns User not found message when user is not found in language: $language', async ({ language, message }) => {
    const response = await request(app).get('/api/1.0/users/5').set('accept-language', language);
    expect(response.body.message).toBe(message);
  });

  it('returns proper error body when user is not found', async () => {
    const timestamp = new Date().getTime();
    const timestampInFiveSeconds = timestamp + 5 * 1000;
    const response = await request(app).get('/api/1.0/users/5');

    const error = response.body;

    expect(error.path).toBe('/api/1.0/users/5');
    expect(error.timestamp).toBeGreaterThan(timestamp);
    expect(error.timestamp).toBeLessThan(timestampInFiveSeconds);
    expect(Object.keys(error)).toEqual(['path', 'timestamp', 'message']);
  });

  it('returns 200 OK when user is found in database', async () => {
    const user = await User.create({ ...validUser, inactive: false });

    const response = await request(app).get(`/api/1.0/users/${user.id}`);
    expect(response.status).toBe(200);
  });

  it('returns id, username and email in response body when active user exists', async () => {
    const user = await User.create({ ...validUser, inactive: false });

    const response = await request(app).get(`/api/1.0/users/${user.id}`);
    expect(Object.keys(response.body)).toEqual(['id', 'username', 'email']);
  });

  it('returns 404 error when inactive user id is passed in request parameter', async () => {
    const user = await User.create({ ...validUser });

    const response = await request(app).get(`/api/1.0/users/${user.id}`);
    expect(response.status).toBe(404);
  });

  it('returns 400 error when non-numeric user id is passed in request parameter', async () => {
    await User.create({ ...validUser });

    const response = await request(app).get('/api/1.0/users/abctest124');
    expect(response.status).toBe(400);
  });

  it.each`
    language | message
    ${'en'}  | ${'Invalid user ID'}
    ${'de'}  | ${'Ungültige Benutzer-Id'}
  `(
    'returns Invalid user ID message when non-numeric user id is passed in request parameter',
    async ({ language, message }) => {
      await User.create({ ...validUser });

      const response = await request(app).get('/api/1.0/users/abctest124').set('accept-language', language);
      expect(response.body.message).toBe(message);
    }
  );
});
