module.exports = function UserNotFoundException() {
  this.status = 400;
  this.message = 'INVALID_USER_ID';
};
