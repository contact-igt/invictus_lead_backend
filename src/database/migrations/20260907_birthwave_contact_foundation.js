const CONTACTS = "birthwave_contacts";
const LEADS = "birthwave_leads";
const WEBSITE_LEADS = "birthwave_website_leads";

const hasColumn = (columns, name) => Object.prototype.hasOwnProperty.call(columns, name);
const indexNames = (indexes) => new Set(indexes.map((index) => String(index.name || "").toLowerCase()));
const constraintNames = (constraints) => new Set(constraints.map((constraint) => String(constraint.constraintName || constraint.name || "").toLowerCase()));

const addIndexIfMissing = async (queryInterface, table, fields, options) => {
  const indexes = await queryInterface.showIndex(table);
  if (!indexNames(indexes).has(options.name.toLowerCase())) {
    await queryInterface.addIndex(table, fields, options);
  }
};

const addColumnIfMissing = async (queryInterface, table, column, definition) => {
  const columns = await queryInterface.describeTable(table);
  if (!hasColumn(columns, column)) await queryInterface.addColumn(table, column, definition);
};

export const name = "20260907_birthwave_contact_foundation";

export async function up({ context: queryInterface, Sequelize }) {
  const existingTables = await queryInterface.showAllTables();
  const normalizedTables = new Set(existingTables.map((table) => String(table).toLowerCase()));

  if (!normalizedTables.has(CONTACTS)) {
    await queryInterface.createTable(CONTACTS, {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
      client_id: { type: Sequelize.INTEGER, allowNull: false },
      display_name: { type: Sequelize.STRING(150), allowNull: false },
      normalized_phone: { type: Sequelize.STRING(32), allowNull: true },
      normalized_email: { type: Sequelize.STRING(200), allowNull: true },
      status: { type: Sequelize.STRING(24), allowNull: false, defaultValue: "active" },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal("CURRENT_TIMESTAMP") },
    });
  }

  await addIndexIfMissing(queryInterface, CONTACTS, ["client_id", "status"], {
    name: "idx_bw_contacts_client_status",
  });
  await addIndexIfMissing(queryInterface, CONTACTS, ["client_id", "normalized_phone"], {
    name: "uq_bw_contacts_client_phone",
    unique: true,
  });
  await addIndexIfMissing(queryInterface, CONTACTS, ["client_id", "normalized_email"], {
    name: "uq_bw_contacts_client_email",
    unique: true,
  });
  await addIndexIfMissing(queryInterface, CONTACTS, ["client_id", "created_at"], {
    name: "idx_bw_contacts_client_created",
  });

  await addColumnIfMissing(queryInterface, LEADS, "contact_id", {
    type: Sequelize.INTEGER,
    allowNull: true,
  });
  await addIndexIfMissing(queryInterface, LEADS, ["client_id", "contact_id"], {
    name: "idx_bw_leads_client_contact",
  });

  await addColumnIfMissing(queryInterface, WEBSITE_LEADS, "external_submission_id", {
    type: Sequelize.STRING(191),
    allowNull: true,
  });
  await addColumnIfMissing(queryInterface, WEBSITE_LEADS, "contact_id", {
    type: Sequelize.INTEGER,
    allowNull: true,
  });
  const leadConstraints = constraintNames(await queryInterface.showConstraint(LEADS));
  if (!leadConstraints.has("fk_bw_leads_contact")) {
    await queryInterface.addConstraint(LEADS, {
      fields: ["contact_id"],
      type: "foreign key",
      name: "fk_bw_leads_contact",
      references: { table: CONTACTS, field: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  }
  const websiteConstraints = constraintNames(await queryInterface.showConstraint(WEBSITE_LEADS));
  if (!websiteConstraints.has("fk_bw_web_leads_contact")) {
    await queryInterface.addConstraint(WEBSITE_LEADS, {
      fields: ["contact_id"],
      type: "foreign key",
      name: "fk_bw_web_leads_contact",
      references: { table: CONTACTS, field: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    });
  }
  await addIndexIfMissing(queryInterface, WEBSITE_LEADS, ["client_id", "source_key", "external_submission_id"], {
    name: "uq_bw_web_leads_submission",
    unique: true,
  });
  await addIndexIfMissing(queryInterface, WEBSITE_LEADS, ["client_id", "contact_id"], {
    name: "idx_bw_web_leads_client_contact",
  });
}

export async function down({ context: queryInterface }) {
  for (const [table, constraint] of [
    [WEBSITE_LEADS, "fk_bw_web_leads_contact"],
    [LEADS, "fk_bw_leads_contact"],
  ]) {
    try {
      await queryInterface.removeConstraint(table, constraint);
    } catch (error) {
      if (error?.name !== "SequelizeUnknownConstraintError" && !/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  }

  for (const [table, index] of [
    [WEBSITE_LEADS, "uq_bw_web_leads_submission"],
    [WEBSITE_LEADS, "idx_bw_web_leads_client_contact"],
    [LEADS, "idx_bw_leads_client_contact"],
    [CONTACTS, "idx_bw_contacts_client_status"],
    [CONTACTS, "uq_bw_contacts_client_phone"],
    [CONTACTS, "uq_bw_contacts_client_email"],
    [CONTACTS, "idx_bw_contacts_client_created"],
  ]) {
    try {
      await queryInterface.removeIndex(table, index);
    } catch (error) {
      if (error?.name !== "SequelizeUnknownConstraintError" && !/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  }

  for (const [table, column] of [
    [WEBSITE_LEADS, "external_submission_id"],
    [WEBSITE_LEADS, "contact_id"],
    [LEADS, "contact_id"],
  ]) {
    try {
      const columns = await queryInterface.describeTable(table);
      if (hasColumn(columns, column)) await queryInterface.removeColumn(table, column);
    } catch (error) {
      if (!/doesn't exist|unknown|not found/i.test(error?.message || "")) throw error;
    }
  }

  const tables = await queryInterface.showAllTables();
  if (tables.some((table) => String(table).toLowerCase() === CONTACTS)) {
    await queryInterface.dropTable(CONTACTS);
  }
}

export default { name, up, down };
