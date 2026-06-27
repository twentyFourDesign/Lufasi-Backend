const Sequelize = require("sequelize");
const sequelize = require("../config/database");

const db = {};
db.Sequelize = Sequelize;
db.sequelize = sequelize;

// Import models
db.User = require("./user")(sequelize, Sequelize);
db.Property = require("./property")(sequelize, Sequelize);
db.Pod = require("./pod")(sequelize, Sequelize);
db.PodImage = require("./podImage")(sequelize, Sequelize);
db.PodPriceRule = require("./podPriceRule")(sequelize, Sequelize);
db.CalendarAvailability = require("./calendarAvailability")(
  sequelize,
  Sequelize
);
db.Discount = require("./discount")(sequelize, Sequelize);
db.Voucher = require("./voucher")(sequelize, Sequelize);
db.Booking = require("./booking")(sequelize, Sequelize);
db.BookingGuest = require("./bookingGuest")(sequelize, Sequelize);
db.BookingPayment = require("./bookingPayment")(sequelize, Sequelize);
db.Payment = require("./payment")(sequelize, Sequelize);
db.BookingLog = require("./bookingLog")(sequelize, Sequelize);
db.Extra = require("./extra")(sequelize, Sequelize);
db.ExtraBlockedDate = require("./extraBlockedDate")(sequelize, Sequelize);
db.BookingExtra = require("./bookingExtra")(sequelize, Sequelize);
db.MealPlan = require("./mealPlan")(sequelize, Sequelize);
db.GuestDirectory = require("./guestDirectory")(sequelize, Sequelize);
db.PaymentToken = require("./paymentToken")(sequelize, Sequelize);
db.PricingConfiguration = require("./pricingConfiguration")(sequelize, Sequelize);
db.SchoolHoliday = require("./schoolHoliday")(sequelize, Sequelize);
db.PeakRate = require("./peakRate")(sequelize, Sequelize);
db.ChannexBookingMap = require("./channexBookingMap")(sequelize, Sequelize);
db.ChannexSyncLog = require("./channexSyncLog")(sequelize, Sequelize);

// Associations
db.Property.hasMany(db.Pod, { foreignKey: "propertyId" });
db.Pod.belongsTo(db.Property, { foreignKey: "propertyId" });

db.Pod.hasMany(db.PodImage, { foreignKey: "podId", as: "images" });
db.PodImage.belongsTo(db.Pod, { foreignKey: "podId" });

db.Pod.hasMany(db.PodPriceRule, { foreignKey: "podId", as: "priceRules" });
db.PodPriceRule.belongsTo(db.Pod, { foreignKey: "podId" });

db.Pod.hasMany(db.CalendarAvailability, {
  foreignKey: "podId",
  as: "calendar",
});
db.CalendarAvailability.belongsTo(db.Pod, { foreignKey: "podId" });

db.Pod.hasMany(db.Booking, { foreignKey: "podId" });
db.Booking.belongsTo(db.Pod, { foreignKey: "podId" });

db.Booking.hasMany(db.BookingGuest, { foreignKey: "bookingId" });
db.BookingGuest.belongsTo(db.Booking, { foreignKey: "bookingId" });

db.Booking.hasMany(db.BookingPayment, { foreignKey: "bookingId" });
db.BookingPayment.belongsTo(db.Booking, { foreignKey: "bookingId" });

db.Booking.hasMany(db.BookingExtra, { foreignKey: "bookingId" });
db.BookingExtra.belongsTo(db.Booking, { foreignKey: "bookingId" });

db.Extra.hasMany(db.BookingExtra, { foreignKey: "extraId" });
db.BookingExtra.belongsTo(db.Extra, { foreignKey: "extraId" });

db.Extra.hasMany(db.ExtraBlockedDate, { foreignKey: "extraId", as: "blockedDates" });
db.ExtraBlockedDate.belongsTo(db.Extra, { foreignKey: "extraId" });

db.Booking.hasMany(db.BookingLog, { foreignKey: "bookingId" });

db.GuestDirectory.hasMany(db.Booking, { foreignKey: "guestDirectoryId" });
db.Booking.belongsTo(db.GuestDirectory, { foreignKey: "guestDirectoryId" });

// PaymentToken association - one token per booking
db.Booking.hasOne(db.PaymentToken, { foreignKey: "bookingId" });
db.PaymentToken.belongsTo(db.Booking, { foreignKey: "bookingId" });

db.Booking.belongsTo(db.Voucher, { foreignKey: "voucherId" });
db.Voucher.hasMany(db.Booking, { foreignKey: "voucherId" });

db.Booking.hasOne(db.ChannexBookingMap, { foreignKey: "bookingId" });
db.ChannexBookingMap.belongsTo(db.Booking, { foreignKey: "bookingId" });

module.exports = db;
