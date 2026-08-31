const test = require('node:test');
const assert = require('node:assert/strict');

const dbPath = require.resolve('../db/knex');
const userServicePath = require.resolve('../services/UserService');
const repositoryPath = require.resolve('../src/modules/staff/access/staff-access.repository');
const servicePath = require.resolve('../src/modules/staff/access/staff-access.service');

function cacheModule(path, exports) {
  require.cache[path] = { id: path, filename: path, loaded: true, exports };
}

function loadService({ repository = {}, userService = {} } = {}) {
  delete require.cache[servicePath];
  cacheModule(dbPath, { transaction: async (callback) => callback({ fn: { now: () => 'now' } }) });
  cacheModule(userServicePath, userService);
  cacheModule(repositoryPath, repository);
  return require(servicePath);
}

test.afterEach(() => {
  [servicePath, repositoryPath, userServicePath, dbPath].forEach((path) => delete require.cache[path]);
});

test('staff access rejects self role changes before mutating the account', async () => {
  let mutated = false;
  const service = loadService({
    repository: {
      findProfile: async () => ({ id: 20, shop_id: 7, user_id: 11 }),
      findUser: async () => ({ id: 11, shop_id: 7, username: 'manager', status: 'active' }),
      roleForUser: async () => ({ id: 3, name: 'Manager' }),
    },
    userService: { updateStaffAccessInTransaction: async () => { mutated = true; } },
  });

  await assert.rejects(
    () => service.updateAccess({ id: 11, shop_id: 7 }, ['users.assign_roles'], 20, { role_id: 4 }),
    (error) => error.status === 409 && /own role/i.test(error.message),
  );
  assert.equal(mutated, false);
});

test('staff account creation requires exactly one create or link mode', () => {
  const { createAccountSchema } = require('../src/modules/staff/access/staff-access.schema');
  assert.doesNotThrow(() => createAccountSchema.parse({ username: 'new.staff', role_id: 2 }));
  assert.doesNotThrow(() => createAccountSchema.parse({ existing_user_id: 15 }));
  assert.throws(() => createAccountSchema.parse({ existing_user_id: 15, username: 'duplicate', role_id: 2 }));
  assert.throws(() => createAccountSchema.parse({}));
});

test('staff access rejects sessions without a positive shop scope', async () => {
  const service = loadService();
  await assert.rejects(
    () => service.loadAccess({ id: 1, shop_id: null }, 2),
    (error) => error.status === 403 && /restaurant must be selected/i.test(error.message),
  );
});
