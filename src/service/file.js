const fs = require('fs');
const path = require('path');
const config = require('config');
const { randomString } = require('../shared/generator');

const { uploadDir, profileDir } = config;
const profileFolder = path.join('.', uploadDir, profileDir);

const createFolders = () => {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
  }

  if (!fs.existsSync(profileFolder)) {
    fs.mkdirSync(profileFolder);
  }
};

const saveProfileImage = async (base64File) => {
  const fileName = await randomString(32);
  const filePath = path.join(profileFolder, fileName);

  // return new Promise((resolve, reject) => {
  //   fs.writeFile(filePath, base64File, { encoding: 'base64' }, (error) => {
  //     if (!error) {
  //       resolve(fileName);
  //     }

  //     reject(error);
  //   });
  // });

  await fs.promises.writeFile(filePath, base64File, { encoding: 'base64' });
  return fileName;
};

const deleteProfileImage = async (fileName) => {
  const filePath = path.join(profileFolder, fileName);

  await fs.promises.unlink(filePath);
};

module.exports = { createFolders, saveProfileImage, deleteProfileImage };
