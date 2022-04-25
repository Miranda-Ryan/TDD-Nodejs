module.exports = function InvalidUserException() {
  this.status = 400;
  this.message = 'INVALID_USER_ID';
};
