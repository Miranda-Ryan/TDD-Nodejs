module.exports = function NotFoundException(message) {
  this.message = message;
  this.status = 404;
};
