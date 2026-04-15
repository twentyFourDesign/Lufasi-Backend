const { Sequelize, Op } = require("sequelize");
const db = require("../src/models");
const sequelize = db.sequelize;

async function flushTestData() {
  console.log("🚀 Starting database test data flush process...\n");
  
  try {
    // Authenticate and sync models if necessary
    await sequelize.authenticate();
    console.log("✅ Database connection established successfully.");

    // We use a transaction to ensure either everything deletes, or nothing does (if supported by the DB setup)
    await sequelize.transaction(async (t) => {
      console.log("⚠️  Beginning transactional cleanup...\n");

      // 1. BookingLog
      const deletedBookingLogs = await db.BookingLog.destroy({ where: {}, transaction: t });
      console.log(`🧹 Deleted Booking Logs: ${deletedBookingLogs}`);

      // 2. PaymentToken
      if (db.PaymentToken) {
          const deletedPaymentTokens = await db.PaymentToken.destroy({ where: {}, transaction: t });
          console.log(`🧹 Deleted Payment Tokens: ${deletedPaymentTokens}`);
      }

      // 3. BookingPayment
      const deletedBookingPayments = await db.BookingPayment.destroy({ where: {}, transaction: t });
      console.log(`🧹 Deleted Booking Payments: ${deletedBookingPayments}`);

      // 4. Payment
      const deletedPayments = await db.Payment.destroy({ where: {}, transaction: t });
      console.log(`🧹 Deleted Payments: ${deletedPayments}`);

      // 5. BookingExtra
      const deletedBookingExtras = await db.BookingExtra.destroy({ where: {}, transaction: t });
      console.log(`🧹 Deleted Booking Extras: ${deletedBookingExtras}`);

      // 6. BookingGuest
      const deletedBookingGuests = await db.BookingGuest.destroy({ where: {}, transaction: t });
      console.log(`🧹 Deleted Booking Guests: ${deletedBookingGuests}`);

      // 7. CalendarAvailability (ONLY blocks tied to bookings)
      const deletedCalendarAvailabilities = await db.CalendarAvailability.destroy({ 
        where: { 
          bookingId: { [Op.not]: null } 
        }, 
        transaction: t 
      });
      console.log(`🧹 Deleted Calendar Availabilities (Tied to Bookings): ${deletedCalendarAvailabilities}`);

      // 8. Booking
      const deletedBookings = await db.Booking.destroy({ where: {}, transaction: t });
      console.log(`🧹 Deleted Bookings: ${deletedBookings}`);

      // 9. GuestDirectory
      const deletedGuestDirectories = await db.GuestDirectory.destroy({ where: {}, transaction: t });
      console.log(`🧹 Deleted Guest Directories: ${deletedGuestDirectories}`);

      // 10. User (Only with role = 'guest')
      const deletedUsers = await db.User.destroy({ 
        where: { role: 'guest' }, 
        transaction: t 
      });
      console.log(`🧹 Deleted Users (role = guest): ${deletedUsers}`);

      // 11. Discounts & Vouchers (Reset usedCount instead of deleting)
      if (db.Discount) {
          const [updatedDiscounts] = await db.Discount.update({ usedCount: 0 }, { where: {}, transaction: t });
          console.log(`🔄 Reset Discount usedCount: ${updatedDiscounts}`);
      }
      
      if (db.Voucher) {
          const [updatedVouchers] = await db.Voucher.update({ usedCount: 0 }, { where: {}, transaction: t });
          console.log(`🔄 Reset Voucher usedCount: ${updatedVouchers}`);
      }
    });

    console.log("\n🎉 Database test data flush completed gracefully!");
    console.log("The system is now clean and ready for production.");

  } catch (error) {
    console.error("\n❌ Error during database flush process!");
    console.error(error.message);
    if (error.original) {
        console.error("Original Error:", error.original.message);
    }
  } finally {
    // Close the database connection gracefully
    await sequelize.close();
  }
}

flushTestData();
