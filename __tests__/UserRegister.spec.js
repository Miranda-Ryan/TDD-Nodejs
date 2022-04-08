const request = require('supertest');
const app = require('../src/app');
const User = require('../src/model/user');
const sequelize = require('../src/config/database');
const EmailService = require('../src/service/email');
const { SMTPServer } = require('smtp-server');

const validUser = {
  username: 'user1',
  email: 'user1@gmail.com',
  password: 'P4ssword',
};

const postUser = (user = validUser, options = {}) => {
  const agent = request(app).post('/api/1.0/users');

  if (options.language) {
    agent.set('accept-language', options.language);
  }

  return agent.send(user);
};

// Create a test SMTP SERVER like sendgrid for testing purpose
let lastMail, server;
beforeAll(async () => {
  server = new SMTPServer({
    authOptional: true,
    onData: (stream, session, callback) => {
      let mailBody;
      stream.on('data', (data) => {
        mailBody += data.toString();
      });

      stream.on('end', () => {
        lastMail = mailBody;
        callback();
      });
    },
  });

  await server.listen(8587, 'localhost');
  await sequelize.sync({ force: true });
});

beforeEach(() => {
  return User.destroy({ truncate: true });
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(async () => {
  await server.close();
  await sequelize.close();
});

describe('User Registration', () => {
  const USER_CREATED = 'User created';
  const USERNAME_NULL = 'Username cannot be null';
  const USERNAME_LENGTH = 'Username must have min 4 characters and max 32 characters';
  const EMAIL_NULL = 'Email cannot be null';
  const EMAIL_INVALID = 'Email is not valid';
  const EMAIL_IN_USE = 'Email already in use';
  const PASSWORD_NULL = 'Password cannot be null';
  const PASSWORD_LENGTH = 'Password must be atleast 6 characters long';
  const PASSWORD_PATTERN = 'Password must have atleast 1 uppercase, 1 lowercase and 1 number';
  const EMAIL_FAILURE = 'Failed to send email';
  const VALIDATION_FAILURE = 'Validation failure';

  it('returns 200 OK when signup request is valid', async () => {
    const response = await postUser();
    expect(response.status).toBe(200);
  });

  it('returns success message when signup request is valid', async () => {
    const response = await postUser();
    expect(response.body.message).toBe(USER_CREATED);
  });

  it('saves the user to database', async () => {
    await postUser();
    const users = await User.findAll();
    expect(users.length).toBe(1);
  });

  it('saves the username and email to database', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];

    expect(savedUser.username).toBe('user1');
    expect(savedUser.email).toBe('user1@gmail.com');
  });

  it('hashes the password in database', async () => {
    await postUser();
    const users = await User.findAll();
    const savedUser = users[0];

    expect(savedUser.password).not.toBe('P4ssword');
  });

  it('creates user in inactive mode when user registers', async () => {
    await postUser();

    const users = await User.findAll();
    const savedUser = users[0];

    expect(savedUser.inactive).toBe(true);
  });

  it('creates user in inactive mode even when req.body contains inactive=false during user registration', async () => {
    await postUser({ ...validUser, inactive: false });

    const users = await User.findAll();
    const savedUser = users[0];

    expect(savedUser.inactive).toBe(true);
  });

  it('creates an activation token for user during registration', async () => {
    await postUser();

    const users = await User.findAll();
    const savedUser = users[0];

    expect(savedUser.activationToken).toBeTruthy();
  });

  it('sends an account activation email with activation token when user registers', async () => {
    await postUser();

    expect(lastMail).toContain('user1@gmail.com');

    const users = await User.findAll();
    const savedUser = users[0];

    expect(lastMail).toContain(savedUser.activationToken);
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
    ${'username'} | ${null}           | ${USERNAME_NULL}
    ${'username'} | ${'axe'}          | ${USERNAME_LENGTH}
    ${'username'} | ${'a'.repeat(33)} | ${USERNAME_LENGTH}
    ${'email'}    | ${null}           | ${EMAIL_NULL}
    ${'email'}    | ${'axe.com'}      | ${EMAIL_INVALID}
    ${'email'}    | ${'axe@com'}      | ${EMAIL_INVALID}
    ${'email'}    | ${'axe.mail.com'} | ${EMAIL_INVALID}
    ${'password'} | ${null}           | ${PASSWORD_NULL}
    ${'password'} | ${'abc24'}        | ${PASSWORD_LENGTH}
    ${'password'} | ${'abcdefgh'}     | ${PASSWORD_PATTERN}
    ${'password'} | ${'ABCDEFG'}      | ${PASSWORD_PATTERN}
    ${'password'} | ${'12334345'}     | ${PASSWORD_PATTERN}
    ${'password'} | ${'1233acb'}      | ${PASSWORD_PATTERN}
    ${'password'} | ${'123APCES'}     | ${PASSWORD_PATTERN}
    ${'password'} | ${'xyysAPCES'}    | ${PASSWORD_PATTERN}
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
    expect(validationErrors.email).toBe(EMAIL_IN_USE);
  });

  it('returns 502 Bad Gateway when sending email fails', async () => {
    jest.spyOn(EmailService, 'sendActivationToken').mockRejectedValue({ message: EMAIL_FAILURE });
    const response = await postUser();
    expect(response.status).toBe(502);
  });

  it('returns Email failure message when sending email fails', async () => {
    jest.spyOn(EmailService, 'sendActivationToken').mockRejectedValue({ message: EMAIL_FAILURE });
    const response = await postUser();
    expect(response.body.message).toBe(EMAIL_FAILURE);
  });

  it('does not save user to db if activation email fails', async () => {
    jest.spyOn(EmailService, 'sendActivationToken').mockRejectedValue({ message: EMAIL_FAILURE });
    await postUser();

    const users = await User.findAll();
    expect(users.length).toBe(0);
  });

  it('returns Validation failure message in error response body when registration fails', async () => {
    const response = await postUser({ ...validUser, username: null });

    expect(response.body.message).toBe(VALIDATION_FAILURE);
  });
});

// =================== USER ACTIVATION ==========================================
describe('User Activation', () => {
  const INVALID_TOKEN = 'Token is invalid';
  const ACCOUNT_ACTIVATED = 'Account activated successfully';

  it('returns 200 OK when when correct token is sent to activate account', async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    expect(response.status).toBe(200);
  });

  it('activates the account when correct token is sent', async () => {
    await postUser();
    let users = await User.findAll();
    const token = users[0].activationToken;

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    users = await User.findAll();
    const userInactive = users[0].inactive;
    expect(userInactive).toBe(false);
  });

  it('removes activationToken from database after account is activated', async () => {
    await postUser();

    let user = await User.findOne({ where: { email: validUser.email } });
    const token = user.activationToken;

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    user = await User.findOne({ where: { email: validUser.email } });
    expect(user.activationToken).toBeFalsy();
  });

  it('returns account activated message after account is activated', async () => {
    await postUser();

    const user = await User.findOne({ where: { email: validUser.email } });
    const token = user.activationToken;

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();
    expect(response.body.message).toBe(ACCOUNT_ACTIVATED);
  });

  it('returns 400 status when the token is invalid', async () => {
    await postUser();

    const token = 'invalid-token';

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    expect(response.status).toBe(400);
  });

  it('returns Invalid token message when the token is invalid', async () => {
    await postUser();

    const token = 'invalid-token';

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    expect(response.body.message).toBe(INVALID_TOKEN);
  });

  it('does not activate the account when the token is invalid', async () => {
    await postUser();

    const token = 'invalid-token';

    await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    const user = await User.findOne({ where: { email: validUser.email } });
    expect(user.inactive).toBe(true);
    expect(user.activationToken).toBeTruthy();
  });
});

// =================== INTERNATIONALIZATION =======================================

describe('Internationalization: User Registration - German', () => {
  const USER_CREATED = 'Benutzer erstellt';
  const USERNAME_NULL = 'Benutzername darf nicht null sein';
  const USERNAME_LENGTH = 'Der Benutzername muss mindestens 4 Zeichen und höchstens 32 Zeichen haben';
  const EMAIL_NULL = 'E-Mail darf nicht null sein';
  const EMAIL_INVALID = 'Email ist ungültig';
  const EMAIL_IN_USE = 'E-Mail wird bereits verwendet';
  const PASSWORD_NULL = 'Das Passwort darf nicht null sein';
  const PASSWORD_LENGTH = 'Das Passwort muss mindestens 6 Zeichen lang sein';
  const PASSWORD_PATTERN = 'Das Passwort muss mindestens 1 Großbuchstaben, 1 Kleinbuchstaben und 1 Zahl enthalten';
  const EMAIL_FAILURE = 'E-Mail konnte nicht gesendet werden';
  const INVALID_TOKEN = 'Token ist ungültig';
  const ACCOUNT_ACTIVATED = 'Konto erfolgreich aktiviert';
  const VALIDATION_FAILURE = 'Validierungsfehler';

  it('returns success message when signup request is valid', async () => {
    const response = await postUser(validUser, { language: 'de' });
    expect(response.body.message).toBe(USER_CREATED);
  });

  it.each`
    field         | value             | message
    ${'username'} | ${null}           | ${USERNAME_NULL}
    ${'username'} | ${'axe'}          | ${USERNAME_LENGTH}
    ${'username'} | ${'a'.repeat(33)} | ${USERNAME_LENGTH}
    ${'email'}    | ${null}           | ${EMAIL_NULL}
    ${'email'}    | ${'axe.com'}      | ${EMAIL_INVALID}
    ${'email'}    | ${'axe@com'}      | ${EMAIL_INVALID}
    ${'email'}    | ${'axe.mail.com'} | ${EMAIL_INVALID}
    ${'password'} | ${null}           | ${PASSWORD_NULL}
    ${'password'} | ${'abc24'}        | ${PASSWORD_LENGTH}
    ${'password'} | ${'abcdefgh'}     | ${PASSWORD_PATTERN}
    ${'password'} | ${'ABCDEFG'}      | ${PASSWORD_PATTERN}
    ${'password'} | ${'12334345'}     | ${PASSWORD_PATTERN}
    ${'password'} | ${'1233acb'}      | ${PASSWORD_PATTERN}
    ${'password'} | ${'123APCES'}     | ${PASSWORD_PATTERN}
    ${'password'} | ${'xyysAPCES'}    | ${PASSWORD_PATTERN}
  `('returns `$message` when $field is $value', async ({ field, value, message }) => {
    const user = { ...validUser };
    user[field] = value;

    const response = await postUser(user, { language: 'de' });
    const { body } = response;

    expect(body.validationErrors[field]).toBe(message);
    expect(body.validationErrors[field]).not.toBeUndefined();
  });

  it('returns `Email already in use` when email is already stored in db', async () => {
    await User.create({ ...validUser });

    const response = await postUser(validUser, { language: 'de' });
    const { validationErrors } = response.body;

    expect(response.status).toBe(400);
    expect(validationErrors.email).toBe(EMAIL_IN_USE);
  });

  it('returns Email failure message when sending email fails', async () => {
    jest.spyOn(EmailService, 'sendActivationToken').mockRejectedValue({ message: EMAIL_FAILURE });
    const response = await postUser(validUser, { language: 'de' });
    expect(response.body.message).toBe(EMAIL_FAILURE);
  });

  it('returns Invalid token message when the token is invalid', async () => {
    await postUser();

    const token = 'invalid-token';

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .set('accept-language', 'de')
      .send();

    expect(response.body.message).toBe(INVALID_TOKEN);
  });

  it('returns account activated message after account is activated', async () => {
    await postUser();

    const user = await User.findOne({ where: { email: validUser.email } });
    const token = user.activationToken;

    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .set('accept-language', 'de')
      .send();
    expect(response.body.message).toBe(ACCOUNT_ACTIVATED);
  });

  it('returns Validation failure message in error response body when registration fails', async () => {
    const response = await postUser({ ...validUser, username: null }, { language: 'de' });

    expect(response.body.message).toBe(VALIDATION_FAILURE);
  });
});

// =============================== ERROR MODEL ========================================================
describe('Error Model', () => {
  it('returns path, timestamp, message and validation errors in response when validation fails', async () => {
    const response = await postUser({ ...validUser, username: null });

    const { body } = response;
    expect(Object.keys(body)).toEqual(['path', 'timestamp', 'message', 'validationErrors']);
  });

  it('returns path, timestamp and message for non-validation errors in response when request fails', async () => {
    const token = 'invalid-token';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    const { body } = response;
    expect(Object.keys(body)).toEqual(['path', 'timestamp', 'message']);
  });

  it('returns correct request path in error body when request fails', async () => {
    const token = 'invalid-token';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    const { body } = response;
    expect(body.path).toEqual('/api/1.0/users/token/' + token);
  });

  it('returns timestamp in milliseconds within 5 seconds of error in error body when request fails', async () => {
    const time = new Date().getTime();
    const timeInFiveSeconds = time + 5 * 1000;

    const token = 'invalid-token';
    const response = await request(app)
      .post('/api/1.0/users/token/' + token)
      .send();

    const { body } = response;
    expect(body.timestamp).toBeGreaterThan(time);
    expect(body.timestamp).toBeLessThan(timeInFiveSeconds);
  });
});
