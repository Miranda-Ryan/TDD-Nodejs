module.exports = function invalidTokenException() {
  this.message = 'INVALID_TOKEN';
  this.status = 400;
};
