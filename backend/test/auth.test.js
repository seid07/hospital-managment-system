const test = require("node:test");
const assert = require("node:assert/strict");
const authService = require("../src/services/auth.service");
const { ensureTestUsers } = require("./helpers/setup-test-users");

test("Authentication Service", async (t) => {
  await ensureTestUsers();

  await t.test("should login successfully with valid admin credentials", async () => {
    const result = await authService.login("admin", "Admin@12345");
    assert.ok(result.token, "Token should be returned");
    assert.ok(result.user, "User object should be returned");
    assert.equal(result.user.username, "admin");
    assert.equal(result.user.role, "ADMIN");
    assert.equal(result.user.password_hash, undefined, "Password hash should be stripped");
  });

  await t.test("should reject login with invalid password", async () => {
    await assert.rejects(
      async () => {
        await authService.login("admin", "WrongPassword!");
      },
      { message: "INVALID_CREDENTIALS" }
    );
  });

  await t.test("should reject login for non-existent user", async () => {
    await assert.rejects(
      async () => {
        await authService.login("non_existent_user_999", "SomePassword!");
      },
      { message: "INVALID_CREDENTIALS" }
    );
  });
});
