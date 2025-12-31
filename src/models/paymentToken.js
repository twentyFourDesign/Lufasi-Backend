const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
    return sequelize.define(
        "PaymentToken",
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },

            token: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
            },

            bookingId: {
                type: DataTypes.UUID,
                allowNull: false,
            },
            expiresAt: {
                type: DataTypes.DATE,
                allowNull: false,
            },
            usedAt: {
                type: DataTypes.DATE,
                allowNull: true,
            },
        },
        { tableName: "payment_tokens" }
    );
};
