const fs = require('fs');
const path = require('path');
const FileService = require('../src/service/file');
const config = require('config');

describe('Create folders', () => {
  const { uploadDir, profileDir } = config;

  it('creates upload folders', async () => {
    const folderName = uploadDir;
    const folderPath = path.join('.', folderName);
    FileService.createFolders();

    expect(fs.existsSync(folderPath)).toBe(true);
  });

  it('creates profile folder under upload folder', async () => {
    const folderPath = path.join('.', uploadDir, profileDir);
    FileService.createFolders();

    expect(fs.existsSync(folderPath)).toBe(true);
  });
});
