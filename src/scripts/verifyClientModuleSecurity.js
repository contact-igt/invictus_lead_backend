import assert from "node:assert/strict";
import { resolvePublicTenantForModule } from "../middlewares/auth/publicTenantMiddleware.js";
import { resolveClientId } from "../utils/resolveClientContext.js";
import { TenantContext } from "../utils/tenantContext.js";

const rioTenant = new TenantContext({
  clientId: 17,
  clientKey: "rio",
  role: "client",
});

assert.equal(
  await resolveClientId({
    tenant: rioTenant,
    expectedModuleKey: "rio",
  }),
  17,
);

await assert.rejects(
  resolveClientId({
    tenant: rioTenant,
    expectedModuleKey: "phoenix_fitness",
  }),
  (error) =>
    error?.status === 404 && error?.message === "Client context not found",
);

await assert.rejects(
  resolveClientId({
    tenant: new TenantContext({ role: "super-admin" }),
    expectedModuleKey: "rio",
  }),
  (error) =>
    error?.status === 400 &&
    error?.message === "_client_key is required for super-admin requests",
);

const response = {
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
};

let nextCalled = false;
await resolvePublicTenantForModule("phoenix_fitness")(
  { headers: { "x-client-key": "rio" }, body: {} },
  response,
  () => {
    nextCalled = true;
  },
);

assert.equal(response.statusCode, 401);
assert.deepEqual(response.body, { message: "Invalid Client Key" });
assert.equal(nextCalled, false);

console.log("Client module security checks passed.");
