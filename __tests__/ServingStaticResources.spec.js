const request = require('supertest');
const app = require('../src/app');
const fs = require('fs');
const path = require('path');
const config = require('config');

const { uploadDir, profileDir } = config;
const profileFolder = path.join('.', uploadDir, profileDir);

afterAll(async () => {
  const profileDirectory = path.join('.', uploadDir, profileDir);
  const files = await fs.promises.readdir(profileDirectory);

  for (const file of files) {
    const filePath = path.join(profileDirectory, file);
    await fs.promises.unlink(filePath);
  }
});

describe('Serve Profile Image', () => {
  it('returns 404 when file is not found', async () => {
    const response = await request(app).get('/images/123456');
    expect(response.status).toBe(404);
  });

  it('returns 200 Ok when file exists', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'testImage.jpg');
    const storedFileName = 'test-file';
    const targetPath = path.join(profileFolder, storedFileName);

    await fs.promises.copyFile(filePath, targetPath);

    const response = await request(app).get('/images/' + storedFileName);
    expect(response.status).toBe(200);
  });

  it('returns cache for 1 year in response', async () => {
    const filePath = path.join('.', '__tests__', 'resources', 'testImage.jpg');
    const storedFileName = 'test-file';
    const targetPath = path.join(profileFolder, storedFileName);

    await fs.promises.copyFile(filePath, targetPath);

    const response = await request(app).get('/images/' + storedFileName);
    const oneYearInSeconds = 365 * 24 * 60 * 60;
    expect(response.headers['cache-control']).toContain(`max-age=${oneYearInSeconds}`);
  });
});
