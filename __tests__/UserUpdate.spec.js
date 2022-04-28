const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const User = require('../src/model/user');
const sequelize = require('../src/config/database');
const bcrypt = require('bcrypt');
const Token = require('../src/model/token');
const config = require('config');

const { uploadDir, profileDir } = config;

beforeAll(async () => {
  await sequelize.sync({ force: true });
});

beforeEach(async () => {
  await User.destroy({ truncate: { cascade: true } });
  await Token.destroy({ truncate: true });
});

afterAll(async () => {
  await sequelize.close();

  const profileDirectory = path.join('.', uploadDir, profileDir);
  const files = await fs.promises.readdir(profileDirectory);

  for (const file of files) {
    const filePath = path.join(profileDirectory, file);
    await fs.promises.unlink(filePath);
  }
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
  const USERNAME_NULL_EN = 'Username cannot be null';
  const USERNAME_LENGTH_EN = 'Username must have min 4 characters and max 32 characters';
  const USERNAME_NULL_DE = 'Benutzername darf nicht null sein';
  const USERNAME_LENGTH_DE = 'Der Benutzername muss mindestens 4 Zeichen und höchstens 32 Zeichen haben';

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

  it('saves the user image when update contains image as base64', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'testImage.jpg');
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' });

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated', image: fileInBase64 };

    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });

    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    expect(inDBUser.profileImage).toBeTruthy();
  });

  it('returns id, username, email and profileImage when update user request is successful', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'testImage.jpg');
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' });

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated', image: fileInBase64 };

    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });

    expect(Object.keys(response.body)).toEqual(['id', 'username', 'email', 'profileImage']);
  });

  it('saves the user image to upload folder and stores filename in db when update contains image', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'testImage.jpg');
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' });

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated', image: fileInBase64 };

    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });

    const inDBUser = await User.findOne({ where: { id: savedUser.id } });
    const { uploadDir, profileDir } = config;
    const profileImagePath = path.join('.', uploadDir, profileDir, inDBUser.profileImage);
    expect(fs.existsSync(profileImagePath)).toBe(true);
  });

  it('removes old image after the user uploads a new one', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'testImage.jpg');
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' });

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated', image: fileInBase64 };

    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });

    const firstImage = response.body.profileImage;

    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });

    const { uploadDir, profileDir } = config;
    const profileImagePath = path.join('.', uploadDir, profileDir, firstImage);
    expect(fs.existsSync(profileImagePath)).toBe(false);
  });

  it('returns 400 when username is null during user update request', async () => {
    const savedUser = await addUser();
    const response = await putUser(
      savedUser.id,
      {},
      {
        auth: { email: savedUser.email, password: validUser.password },
      }
    );
    expect(response.status).toBe(400);
  });

  it('returns validation errors  field in response body when validation error occurs during user update request', async () => {
    const savedUser = await addUser();
    const response = await putUser(
      savedUser.id,
      {},
      {
        auth: { email: savedUser.email, password: validUser.password },
      }
    );
    expect(response.body.validationErrors).not.toBeUndefined();
  });

  it.each`
    language | field         | value             | message
    ${'en'}  | ${'username'} | ${null}           | ${USERNAME_NULL_EN}
    ${'en'}  | ${'username'} | ${'axe'}          | ${USERNAME_LENGTH_EN}
    ${'en'}  | ${'username'} | ${'a'.repeat(33)} | ${USERNAME_LENGTH_EN}
    ${'de'}  | ${'username'} | ${null}           | ${USERNAME_NULL_DE}
    ${'de'}  | ${'username'} | ${'axe'}          | ${USERNAME_LENGTH_DE}
    ${'de'}  | ${'username'} | ${'a'.repeat(33)} | ${USERNAME_LENGTH_DE}
  `(
    'returns `$message` when $field is $value during user update request',
    async ({ language, field, value, message }) => {
      const savedUser = await addUser();
      const validUpdate = { ...validUser, username: value };

      const user = { ...validUser };
      user[field] = value;

      const response = await putUser(savedUser.id, validUpdate, {
        auth: { email: savedUser.email, password: validUser.password },
        language,
      });
      const { body } = response;

      expect(body.validationErrors[field]).toBe(message);
      expect(body.validationErrors[field]).not.toBeUndefined();
    }
  );

  it('returns 200 OK when the image size is equal to 2MB', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'testImage.jpg');
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' });
    const jpgBytes = Buffer.from(fileInBase64, 'base64').length;

    const filling = 'a'.repeat(1024 * 1024 * 2 - jpgBytes);
    const fillBase64 = Buffer.from(filling).toString('base64');

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'user1-updated', image: fileInBase64 + fillBase64 };

    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });
    expect(response.status).toBe(200);
  });

  it('returns 400 when the image size is greater than 2MB', async () => {
    const file = 'a'.repeat(1024 * 1024 * 2 + 1);
    const fileInBase64 = Buffer.from(file).toString('base64');

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'user1-updated', image: fileInBase64 };

    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });
    expect(response.status).toBe(400);
  });

  it('keeps the old image after user only updates username', async () => {
    const savedUser = await addUser();
    const userBeforeUpdate = await User.findOne({ where: { id: savedUser.id } });

    const validUpdate = { ...validUser, username: 'USER1-updated' };
    await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });

    const userAfterUpdate = await User.findOne({ where: { id: savedUser.id } });
    expect(userAfterUpdate.profileImage).toEqual(userBeforeUpdate.profileImage);
  });

  it.each`
    file               | type     | status
    ${'testImage.jpg'} | ${'jpg'} | ${200}
    ${'test-gif.gif'}  | ${'gif'} | ${400}
    ${'test-pdf.pdf'}  | ${'pdf'} | ${400}
    ${'test-txt.txt'}  | ${'txt'} | ${400}
  `('returns $status when uploading images that are of type $type', async ({ file, type, status }) => {
    const filePath = path.join('.', '__tests__', 'resources', file);
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' });

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated', image: fileInBase64 };

    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
    });

    expect(response.status).toBe(status);
  });

  it.each`
    file              | language | message
    ${'test-gif.gif'} | ${'en'}  | ${'Invalid file type'}
    ${'test-pdf.pdf'} | ${'en'}  | ${'Invalid file type'}
    ${'test-txt.txt'} | ${'en'}  | ${'Invalid file type'}
    ${'test-gif.gif'} | ${'de'}  | ${'ungültiger Dateityp'}
    ${'test-pdf.pdf'} | ${'de'}  | ${'ungültiger Dateityp'}
    ${'test-txt.txt'} | ${'de'}  | ${'ungültiger Dateityp'}
  `('returns $status when uploading images that are of type $type', async ({ file, language, message }) => {
    const filePath = path.join('.', '__tests__', 'resources', file);
    const fileInBase64 = fs.readFileSync(filePath, { encoding: 'base64' });

    const savedUser = await addUser();
    const validUpdate = { ...validUser, username: 'USER1-updated', image: fileInBase64 };

    const response = await putUser(savedUser.id, validUpdate, {
      auth: { email: savedUser.email, password: validUser.password },
      language,
    });

    expect(response.body.validationErrors['image']).toBe(message);
  });
});
