const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  return sequelize.define(
    "ChannexSyncLog",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      syncType: {
        type: DataTypes.STRING(50),
        allowNull: false,
        field: "sync_type",
      },
      status: {
        type: DataTypes.ENUM(
          "pending",
          "processing",
          "success",
          "failed",
          "skipped",
        ),
        defaultValue: "pending",
      },
      idempotencyKey: {
        type: DataTypes.STRING(200),
        allowNull: true,
        unique: true,
        field: "idempotency_key",
      },
      payload: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      result: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      attempts: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      lastError: {
        type: DataTypes.TEXT,
        allowNull: true,
        field: "last_error",
      },
      processedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: "processed_at",
      },
    },
    {
      tableName: "channex_sync_log",
      indexes: [
        { fields: ["sync_type", "status"] },
        { fields: ["createdAt"] },
      ],
    },
  );
};
