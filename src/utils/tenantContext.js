/**
 * Centralized utility for multi-tenant query isolation.
 */

export class TenantContext {
  constructor(user) {
    this.id =
      user?.clientId ??
      user?.client_id ??
      (Object.prototype.hasOwnProperty.call(user || {}, "isSuperAdmin")
        ? user?.id
        : null) ??
      null;
    this.role = user?.role || "user";
    this.isSuperAdmin =
      typeof user?.isSuperAdmin === "boolean"
        ? user.isSuperAdmin
        : this.role === "super-admin";
  }

  /**
   * Generates a Sequelize 'where' clause that enforces tenant isolation.
   * @param {Object} additionalFilters - Existing filters to merge with tenant scope.
   * @returns {Object} Combined where clause.
   */
  getScope(additionalFilters = {}) {
    if (this.isSuperAdmin) {
      return { ...additionalFilters };
    }

    if (!this.id) {
      // Fail-safe: If no client ID is found for a non-super-admin,
      // return a condition that will never match to prevent data leaks.
      console.error(
        "CRITICAL: Tenant isolation triggered for user without clientId",
        { role: this.role },
      );
      return { ...additionalFilters, client_id: -1 };
    }

    return {
      ...additionalFilters,
      client_id: this.id,
    };
  }

  /**
   * Fail-safe check to ensure a model has a client_id column before querying.
   * (Used during development/debugging to prevent runtime errors).
   */
  validateModel(model) {
    if (!model.rawAttributes.client_id && !this.isSuperAdmin) {
      throw new Error(
        `Model ${model.name} is missing client_id column required for tenant isolation.`,
      );
    }
  }
}

/**
 * Helper to wrap Sequelize model methods with tenant safety.
 */
export const tenantSafe = (model, user) => {
  const context =
    user instanceof TenantContext ? user : new TenantContext(user);

  return {
    findAll: (options = {}) => {
      options.where = context.getScope(options.where);
      return model.findAll(options);
    },
    findOne: (options = {}) => {
      options.where = context.getScope(options.where);
      return model.findOne(options);
    },
    count: (options = {}) => {
      options.where = context.getScope(options.where);
      return model.count(options);
    },
    findAndCountAll: (options = {}) => {
      options.where = context.getScope(options.where);
      return model.findAndCountAll(options);
    },
    destroy: (options = {}) => {
      options.where = context.getScope(options.where);
      return model.destroy(options);
    },
    // Add other methods as needed
  };
};
