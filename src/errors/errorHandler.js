// eslint-disable-next-line no-unused-vars
module.exports = (error, req, res, next) => {
  const { status, message, errors } = error;

  let validationErrors;
  if (errors) {
    validationErrors = {};
    errors.forEach((error) => {
      validationErrors[error.param] = req.t(error.msg);
    });
  }

  res
    .status(status)
    .json({ path: req.originalUrl, timestamp: new Date().getTime(), message: req.t(message), validationErrors });
};
