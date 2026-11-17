/**
 * Make sure the users.role column accepts "super_admin" (idempotent).
 * If the column is a Postgres ENUM the value is added; a plain text column
 * needs nothing.
 */
async function ensureSuperAdminRole(sequelize) {
  const [rows] = await sequelize.query(`
    SELECT t.typname
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE c.relname = 'users' AND a.attname = 'role' AND t.typtype = 'e'
    LIMIT 1;
  `);
  if (!rows.length) return;

  const typeName = String(rows[0].typname).replace(/"/g, '""');
  await sequelize.query(`ALTER TYPE "${typeName}" ADD VALUE IF NOT EXISTS 'super_admin';`);
}

module.exports = { ensureSuperAdminRole };
