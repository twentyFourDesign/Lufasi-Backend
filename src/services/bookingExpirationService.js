/**
 * Booking Expiration Service
 * Handles expiring unpaid bookings and cleaning up calendar availability
 */

const db = require("../models");
const { Op } = require("sequelize");
const { triggerAriPushForStay } = require("./channexAriService");
const { isBookingHoldingInventory } = require("../utils/inventoryHolds");

class BookingExpirationService {

    /**
     * Remove calendar rows tied to bookings that no longer hold inventory.
     */
    async cleanupStaleCalendarRows() {
        const [result] = await db.sequelize.query(`
            DELETE FROM calendar_availabilities ca
            USING bookings b
            WHERE ca."bookingId" = b.id
              AND ca.status = 'booked'
              AND (
                b."bookingStatus" IN ('expired', 'cancelled', 'failed', 'abandoned')
                OR (b."bookingStatus" = 'pending' AND b."expiresAt" < NOW())
              )
        `);
        return result?.rowCount ?? 0;
    }

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

        // Safety net: remove any calendar rows the cron may have missed
        const cleaned = await this.cleanupStaleCalendarRows();
        if (cleaned > 0) {
            console.log(`[Expiry] Cleaned ${cleaned} stale calendar row(s)`);
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

        triggerAriPushForStay(booking.checkIn, booking.checkOut).catch((err) => {
            console.error("[Channex] Post-expiry ARI sync failed:", err.message);
        });
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
