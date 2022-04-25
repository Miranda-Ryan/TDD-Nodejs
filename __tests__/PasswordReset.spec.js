const request = require('supertest');
const app = require('../src/app');
const sequelize = require('../src/config/database');
const User = require('../src/model/user');
const bcrypt = require('bcrypt');
const { SMTPServer } = require('smtp-server');
const EmailService = require('../src/service/email');
const Token = require('../src/model/token');

let server, lastMail;
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

beforeEach(async () => {
  await User.destroy({ truncate: { cascade: true } });
});

afterAll(async () => {
  await sequelize.close();
  await server.close();
});

const sendPasswordResetEmail = async (email, options = {}) => {
  const agent = request(app).post('/api/1.0/user/password-reset');

  if (options.language) {
    agent.set('accept-language', options.language);
  }

  return agent.send({ email });
};

const sendPasswordUpdateRequest = async (body, options = {}) => {
  const agent = request(app).put('/api/1.0/user/password');

  if (options.language) {
    agent.set('accept-language', options.language);
  }

  return agent.send({
    password: body.password,
    passwordResetToken: body.passwordResetToken,
  });
};

const addUser = async () => {
  const hash = await bcrypt.hash('test1234', 10);

  return User.create({ username: 'user1', email: 'user1@xyz.com', password: hash, inactive: false });
};

const invalidEmail = 'randomuser@xyz.com';

describe('Password Reset', () => {
  it('returns 404 when password reset request is sent for unknown email', async () => {
    const response = await sendPasswordResetEmail(invalidEmail);
    expect(response.status).toBe(404);
  });

  it.each`
    language | message
    ${'en'}  | ${'Email not found'}
    ${'de'}  | ${'Email wurde nicht gefunden'}
  `(
    'returns error message and body when trying to reset password for unknown email when language is $language',
    async ({ language, message }) => {
      const timeNow = new Date().getTime();
      const response = await sendPasswordResetEmail(invalidEmail, { language });

      expect(response.body.message).toBe(message);
      expect(response.body.timestamp).toBeGreaterThan(timeNow);
      expect(response.body.path).toBe('/api/1.0/user/password-reset');
      expect(Object.keys(response.body)).toEqual(['path', 'timestamp', 'message']);
    }
  );

  it.each`
    language | value        | message                 | validationErrorMessage
    ${'en'}  | ${null}      | ${'Validation failure'} | ${'Email cannot be null'}
    ${'en'}  | ${'sbs.com'} | ${'Validation failure'} | ${'Email is not valid'}
    ${'en'}  | ${'sbs@com'} | ${'Validation failure'} | ${'Email is not valid'}
    ${'de'}  | ${null}      | ${'Validierungsfehler'} | ${'E-Mail darf nicht null sein'}
    ${'de'}  | ${'sbs.com'} | ${'Validierungsfehler'} | ${'Email ist ungültig'}
    ${'de'}  | ${'sbs@com'} | ${'Validierungsfehler'} | ${'Email ist ungültig'}
  `(
    'returns 400 status, validation error message, body and validationErrors when trying to reset password for invalid email when language is $language',
    async ({ language, value, message, validationErrorMessage }) => {
      const timeNow = new Date().getTime();
      const response = await sendPasswordResetEmail(value, { language });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(message);
      expect(response.body.timestamp).toBeGreaterThan(timeNow);
      expect(response.body.path).toBe('/api/1.0/user/password-reset');
      expect(Object.keys(response.body)).toEqual(['path', 'timestamp', 'message', 'validationErrors']);

      expect(response.body.validationErrors['email']).toBe(validationErrorMessage);
    }
  );

  it('returns 200 OK when a password reset request is sent for a known email', async () => {
    await addUser();
    const response = await sendPasswordResetEmail('user1@xyz.com');
    expect(response.status).toBe(200);
  });

  it('returns `Check your email...` message when password reset request is successful', async () => {});

  it.each`
    language | message
    ${'en'}  | ${'Check your email for steps on resetting your password'}
    ${'de'}  | ${'Sehen Sie in Ihren E-Mails nach, wie Sie Ihr Passwort zurücksetzen können'}
  `(
    'returns `Check your email...` message when password reset request is successful for known email when language is $language',
    async ({ language, message }) => {
      await addUser();
      const response = await sendPasswordResetEmail('user1@xyz.com', { language });
      expect(response.body.message).toBe(message);
    }
  );

  it('creates a passwordResetToken when a password reset request is sent for a known email', async () => {
    await addUser();
    await sendPasswordResetEmail('user1@xyz.com');

    const userInDb = await User.findOne({ where: { email: 'user1@xyz.com' } });
    expect(userInDb.passwordResetToken).toBeTruthy();
  });

  it('sends a password reset email with password reset token when reset request is sent for a known email', async () => {
    await addUser();
    await sendPasswordResetEmail('user1@xyz.com');

    const user = await User.findOne({ where: { email: 'user1@xyz.com' } });
    expect(lastMail).toContain(user.passwordResetToken);
  });

  it('sends 502 Bad Gateway when sending email fails', async () => {
    jest.spyOn(EmailService, 'sendPasswordResetToken').mockRejectedValue({ message: 'PASSWORD_RESET_FAILED' });

    await addUser();
    const response = await sendPasswordResetEmail('user1@xyz.com');

    expect(response.status).toBe(502);
  });

  it.each`
    language | message
    ${'en'}  | ${'Failed to send email'}
    ${'de'}  | ${'E-Mail konnte nicht gesendet werden'}
  `(
    'returns `Failed to send email` message when password reset request fails and language is $language',
    async ({ language, message }) => {
      jest.spyOn(EmailService, 'sendPasswordResetToken').mockRejectedValue({ message: 'PASSWORD_RESET_FAILED' });

      await addUser();
      const response = await sendPasswordResetEmail('user1@xyz.com', { language });

      expect(response.body.message).toBe(message);
    }
  );
});

describe('Password Update', () => {
  const PASSWORD_NULL_EN = 'Password cannot be null';
  const PASSWORD_LENGTH_EN = 'Password must be atleast 6 characters long';
  const PASSWORD_PATTERN_EN = 'Password must have atleast 1 uppercase, 1 lowercase and 1 number';
  const PASSWORD_NULL_DE = 'Das Passwort darf nicht null sein';
  const PASSWORD_LENGTH_DE = 'Das Passwort muss mindestens 6 Zeichen lang sein';
  const PASSWORD_PATTERN_DE = 'Das Passwort muss mindestens 1 Großbuchstaben, 1 Kleinbuchstaben und 1 Zahl enthalten';

  it('returns 403 when password update request does not have the valid password reset token', async () => {
    const response = await sendPasswordUpdateRequest({
      password: 'P4ssword',
      passwordResetToken: 'invalid-token',
    });
    expect(response.status).toBe(403);
  });

  it.each`
    language | message
    ${'en'}  | ${'You are not authorized to update this password'}
    ${'de'}  | ${'Sie sind nicht berechtigt, dieses Passwort zu aktualisieren'}
  `(
    'returns error body with $message when language is set to $language after trying to update password with invalid reset token',
    async ({ language, message }) => {
      const timeNow = new Date().getTime();
      const response = await sendPasswordUpdateRequest(
        { password: 'P4ssword', passwordResetToken: 'invalid-token' },
        { language }
      );

      expect(response.body.message).toBe(message);
      expect(response.body.timestamp).toBeGreaterThan(timeNow);
      expect(response.body.path).toBe('/api/1.0/user/password');
      expect(Object.keys(response.body)).toEqual(['path', 'timestamp', 'message']);
    }
  );

  it('returns 400 when password update request is made with invalid password but valid reset token', async () => {
    const user = await addUser();
    user.passwordResetToken = 'valid-reset-token';
    await user.save();

    const response = await sendPasswordUpdateRequest({
      password: 'invalid-password',
      passwordResetToken: 'valid-reset-token',
    });
    expect(response.status).toBe(400);
  });

  it.each`
    field         | language | value          | message
    ${'password'} | ${'en'}  | ${null}        | ${PASSWORD_NULL_EN}
    ${'password'} | ${'en'}  | ${'abc24'}     | ${PASSWORD_LENGTH_EN}
    ${'password'} | ${'en'}  | ${'abcdefgh'}  | ${PASSWORD_PATTERN_EN}
    ${'password'} | ${'en'}  | ${'ABCDEFG'}   | ${PASSWORD_PATTERN_EN}
    ${'password'} | ${'en'}  | ${'12334345'}  | ${PASSWORD_PATTERN_EN}
    ${'password'} | ${'en'}  | ${'1233acb'}   | ${PASSWORD_PATTERN_EN}
    ${'password'} | ${'en'}  | ${'123APCES'}  | ${PASSWORD_PATTERN_EN}
    ${'password'} | ${'en'}  | ${'xyysAPCES'} | ${PASSWORD_PATTERN_EN}
    ${'password'} | ${'de'}  | ${null}        | ${PASSWORD_NULL_DE}
    ${'password'} | ${'de'}  | ${'abc24'}     | ${PASSWORD_LENGTH_DE}
    ${'password'} | ${'de'}  | ${'abcdefgh'}  | ${PASSWORD_PATTERN_DE}
    ${'password'} | ${'de'}  | ${'ABCDEFG'}   | ${PASSWORD_PATTERN_DE}
    ${'password'} | ${'de'}  | ${'12334345'}  | ${PASSWORD_PATTERN_DE}
    ${'password'} | ${'de'}  | ${'1233acb'}   | ${PASSWORD_PATTERN_DE}
    ${'password'} | ${'de'}  | ${'123APCES'}  | ${PASSWORD_PATTERN_DE}
    ${'password'} | ${'de'}  | ${'xyysAPCES'} | ${PASSWORD_PATTERN_DE}
  `(
    'returns `$message` when $field has invalid value $value during update password and reset token is valid and language is $language',
    async ({ field, language, value, message }) => {
      const user = await addUser();
      user.passwordResetToken = 'valid-reset-token';
      await user.save();

      const response = await sendPasswordUpdateRequest(
        {
          password: value,
          passwordResetToken: 'valid-reset-token',
        },
        { language }
      );

      const body = response.body;

      expect(body.validationErrors[field]).toBe(message);
      expect(body.validationErrors[field]).not.toBeUndefined();
    }
  );

  it('returns 200 OK when valid password is sent with valid reset token', async () => {
    const user = await addUser();
    user.passwordResetToken = 'valid-reset-token';
    await user.save();

    const response = await sendPasswordUpdateRequest({
      password: 'P4ssword',
      passwordResetToken: 'valid-reset-token',
    });
    expect(response.status).toBe(200);
  });

  it('updates password in db when valid password is sent with valid reset token', async () => {
    const user = await addUser();
    user.passwordResetToken = 'valid-reset-token';
    await user.save();

    await sendPasswordUpdateRequest({
      password: 'P4ssword',
      passwordResetToken: 'valid-reset-token',
    });

    const userInDB = await User.findOne({ where: { email: 'user1@xyz.com' } });
    expect(userInDB.password).not.toEqual(user.password);
  });

  it('clears all login tokens in db when valid password is sent with valid reset token', async () => {
    const user = await addUser();
    user.passwordResetToken = 'valid-reset-token';
    await user.save();

    await Token.create({
      token: 'token-1',
      userId: user.id,
      lastUsedAt: Date.now(),
    });

    await sendPasswordUpdateRequest({
      password: 'P4ssword',
      passwordResetToken: 'valid-reset-token',
    });

    const tokens = await Token.findAll({ where: { userId: user.id } });
    expect(tokens.length).toBe(0);
  });
});
