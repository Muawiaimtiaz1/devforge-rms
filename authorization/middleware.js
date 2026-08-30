const { getUserPermissions } = require('./service');

function requirePermission(...required) {
  return async (req, res, next) => {
    if (!req.session?.user) return res.status(401).json({ error: 'Unauthorized' });
    // Global API authorization may already have resolved permissions for this
    // request. Reuse them instead of repeating the same remote database query
    // in route-level middleware.
    const permissions = Array.isArray(req.permissions)
      ? req.permissions
      : await getUserPermissions(req.session.user);
    req.permissions = permissions;
    req.session.user.permissions = permissions;
    if (!required.some((key) => permissions.includes(key))) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.', required_permissions: required });
    }
    next();
  };
}

module.exports = { requirePermission };
