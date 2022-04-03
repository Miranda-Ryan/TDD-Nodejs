const request = require('supertest');
const app = require('../src/app');
const User = require('../src/model/user');
const sequelize = require('../src/config/database');

const validUser = {
  username: 'user1',
  email: 'user1@gmail.com',
  password: 'P4ssword',
};

beforeAll(() => {
  return sequelize.sync({ force: true });
});

beforeEach(() => {
  return User.destroy({ truncate: true });
});

afterAll(() => {
  return sequelize.close();
});

describe('User Registration', () => {
  const postUser = (user = validUser) => {
    return request(app).post('/api/1.0/users').send(user);
  };

  it('returns 200 OK when signup request is valid', async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  it('returns success message when signup request is valid', async () => {
    const response = await postUser();
    expect(response.body.message).toBe('User created');
  });

  it('saves the user to database', async () => {
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(1);
  });

  it('saves the username and email to database', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0].get();

    expect(savedUser.username).toBe('user1');
    expect(savedUser.email).toBe('user1@gmail.com');
  });

  it('hashes the password in database', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0].get();

    expect(savedUser.password).not.toBe('P4ssword');
  });

  it('returns 400 when username is null', async () => {
    const response = await postUser({ ...validUser, username: null });
    expect(response.status).toBe(400);
  });

  it('returns validation errors  field in response body when validation error occurs', async () => {
    const response = await postUser({ ...validUser, username: null });
    expect(response.body.validationErrors).not.toBeUndefined();
  });

  it.each`
    field         | value             | message
    ${'username'} | ${null}           | ${'Username cannot be null'}
    ${'username'} | ${'axe'}          | ${'Username must have min 4 characters and max 32 characters'}
    ${'username'} | ${'a'.repeat(33)} | ${'Username must have min 4 characters and max 32 characters'}
    ${'email'}    | ${null}           | ${'Email cannot be null'}
    ${'email'}    | ${'axe.com'}      | ${'Email is not valid'}
    ${'email'}    | ${'axe@com'}      | ${'Email is not valid'}
    ${'email'}    | ${'axe.mail.com'} | ${'Email is not valid'}
    ${'password'} | ${null}           | ${'Password cannot be null'}
    ${'password'} | ${'abc24'}        | ${'Password must be atleast 6 characters long'}
    ${'password'} | ${'abcdefgh'}     | ${'Password must have atleast 1 uppercase, 1 lowercase and 1 number'}
    ${'password'} | ${'ABCDEFG'}      | ${'Password must have atleast 1 uppercase, 1 lowercase and 1 number'}
    ${'password'} | ${'12334345'}     | ${'Password must have atleast 1 uppercase, 1 lowercase and 1 number'}
    ${'password'} | ${'1233acb'}      | ${'Password must have atleast 1 uppercase, 1 lowercase and 1 number'}
    ${'password'} | ${'123APCES'}     | ${'Password must have atleast 1 uppercase, 1 lowercase and 1 number'}
    ${'password'} | ${'xyysAPCES'}    | ${'Password must have atleast 1 uppercase, 1 lowercase and 1 number'}
  `('returns `$message` when $field is $value', async ({ field, value, message }) => {
    const user = { ...validUser };
    user[field] = value;

    const response = await postUser(user);
    const { body } = response;

    expect(body.validationErrors[field]).toBe(message);
    expect(body.validationErrors[field]).not.toBeUndefined();
  });

  it('returns `Email already in use` when email is already stored in db', async () => {
    await User.create({ ...validUser });

    const response = await postUser();
    const { validationErrors } = response.body;

    expect(response.status).toBe(400);
    expect(validationErrors.email).toBe('Email already in use');
  });
});
