module.exports = function UserNotFoundException() {
  this.status = 404;
  this.message = 'USER_NOT_FOUND';
};
