const pagination = (req, res, next) => {
  const pageNumber = Number.parseInt(req.query.page);
  const pageSize = Number.parseInt(req.query.pageSize);

  let page = Number.isNaN(pageNumber) ? 1 : pageNumber;
  if (page < 1) {
    page = 1;
  }

  let size = Number.isNaN(pageSize) ? 10 : pageSize;
  if (size < 1 || size > 10) {
    size = 10;
  }

  req.pagination = { page, size };
  next();
};

module.exports = pagination;
