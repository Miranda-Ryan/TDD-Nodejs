const express = require('express');
const i18next = require('i18next');
const Backend = require('i18next-fs-backend');
const middleware = require('i18next-http-middleware');
const userRouter = require('./router/user');
const authRouter = require('./router/auth');
const errorHandler = require('./errors/errorHandler');
const tokenAuthentication = require('./middleware/tokenAuthentication');

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

const app = express();

app.use(middleware.handle(i18next));
app.use(express.json());

app.use(tokenAuthentication);

app.use(userRouter);
app.use(authRouter);
app.use(errorHandler);

module.exports = app;
