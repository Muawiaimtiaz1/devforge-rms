const { getUserPermissions } = require('./service');

function requirePermission(...required) {
  return async (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
    const permissions = await getUserPermissions(req.session.user);
    req.permissions = permissions;
    req.session.user.permissions = permissions;
    if (!required.some((key) => permissions.includes(key))) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.', required_permissions: required });
    }
    next();
  };
}

module.exports = { requirePermission };
