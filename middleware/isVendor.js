module.exports = (req, res, next) => {
  if (!req.user || req.user.role !== "vendor") {
    return res
      .status(403)
      .json({ message: "Only vendors can perform this action." });
  }
  next();
};
