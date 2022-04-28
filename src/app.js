const express = require('express');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const userRouter = require('./router/user');
const authRouter = require('./router/auth');
const errorHandler = require('./errors/errorHandler');
const tokenAuthentication = require('./middleware/tokenAuthentication');
const FileService = require('./service/file');
const config = require('config');
const path = require('path');

const { uploadDir, profileDir } = config;
const profileFolder = path.join('.', uploadDir, profileDir);

i18next
  .use(Backend)
  .use(middleware.LanguageDetector)
  .init({
    fallbackLng: 'en',
    lng: 'en',
    ns: ['translation'],
    defaultNS: 'translation',
    backend: {
      loadPath: './locales/{{lng}}/{{ns}}.json',
    },
    detection: {
      lookupHeader: 'accept-language',
    },
  });

FileService.createFolders();

const app = express();

app.use(middleware.handle(i18next));
app.use(express.json({ limit: '3mb' }));

const oneYearInMilliSeconds = 365 * 24 * 60 * 60 * 1000;
app.use('/images/', express.static(profileFolder, { maxAge: oneYearInMilliSeconds }));

app.use(tokenAuthentication);

app.use(userRouter);
app.use(authRouter);
app.use(errorHandler);

module.exports = app;
