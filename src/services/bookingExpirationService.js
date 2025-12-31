/**
 * Booking Expiration Service
 * Handles expiring unpaid bookings and cleaning up calendar availability
 */

const db = require("../models");
const { Op } = require("sequelize");

class BookingExpirationService {

    async expireOldBookings() {
        const now = new Date();

        const expiredBookings = await db.Booking.findAll({
            where: {
                bookingStatus: "pending",
                expiresAt: { [Op.lt]: now },
            },
        });

        let count = 0;
        for (const booking of expiredBookings) {
            await this.expireBooking(booking);
            count++;
        }

        if (count > 0) {
            console.log(`Expired ${count} pending bookings`);
        }

        return count;
    }

    async expireBooking(booking) {
        // Update booking status
        await booking.update({ bookingStatus: "expired" });

        // Remove calendar availability entries to free up dates
        await db.CalendarAvailability.destroy({
            where: { bookingId: booking.id },
        });

        // Log the expiration
        await db.BookingLog.create({
            bookingId: booking.id,
            action: "Booking expired due to non-payment",
            oldStatus: "pending",
            newStatus: "expired",
        });

        console.log(`Booking ${booking.bookingReference} expired`);
    }

    async checkAndExpireBooking(bookingId) {
        const booking = await db.Booking.findByPk(bookingId, {
            include: [db.GuestDirectory],
        });

        if (!booking) return null;

        // Check if booking should be expired
        if (
            booking.bookingStatus === "pending" &&
            booking.expiresAt &&
            new Date(booking.expiresAt) < new Date()
        ) {
            await this.expireBooking(booking);
            await booking.reload();
        }

        return booking;
    }

    async extendExpiration(bookingId, minutes = 30) {
        const booking = await db.Booking.findByPk(bookingId);

        // Allow extension for pending or failed bookings (to enable retry)
        if (!booking || (booking.bookingStatus !== "pending" && booking.bookingStatus !== "failed")) {
            return null;
        }

        const newExpiration = new Date(Date.now() + minutes * 60 * 1000);
        await booking.update({ expiresAt: newExpiration });

        console.log(`Extended expiration for booking ${booking.bookingReference} to ${newExpiration}`);

        return booking;
    }
}

module.exports = new BookingExpirationService();
