/**
 * Beds24 channel manager configuration (API v2).
 *
 * Lufasi's base prices are pre-tax: checkout adds 12.5% VAT + 2.5% service charge.
 * Prices are pushed unchanged; set the same taxes in each OTA extranet.
 */
const beds24Config = {
  baseUrl: process.env.BEDS24_BASE_URL || "https://beds24.com/api/v2",

  /** Long-lived refresh token, made once from an invite code (scripts/beds24-setup.js). */
  refreshToken: process.env.BEDS24_REFRESH_TOKEN || "",

  /** Beds24 property id and the id of the single "Geodesic Dome" room (quantity = number of domes). */
  propertyId: process.env.BEDS24_PROPERTY_ID || "",
  roomId: process.env.BEDS24_ROOM_ID || "",

  /**
   * Shared secret for the booking webhook. Put the same value in Beds24 as part of
   * the webhook URL (?secret=...) or a custom header named x-webhook-secret.
   */
  webhookSecret: process.env.BEDS24_WEBHOOK_SECRET || "",

  /** Rolling window (days) for availability and price pushes */
  ariWindowDays: Number(process.env.BEDS24_ARI_WINDOW_DAYS) || 365,

  /** Minimum stay published to OTAs */
  minStay: Number(process.env.BEDS24_MIN_STAY) || 1,

  /** Calendar entries sent per API call */
  calendarBatchSize: Number(process.env.BEDS24_CALENDAR_BATCH_SIZE) || 50,

  /** Re-read this many minutes before the last pull so a missed change is never lost */
  pullOverlapMinutes: Number(process.env.BEDS24_PULL_OVERLAP_MINUTES) || 10,

  /**
   * UNVERIFIED, confirm on the first test with a real account.
   *   "absolute"          push Lufasi's free-dome count as the number available
   *                       (Lufasi already subtracts imported Beds24 bookings).
   *   "beds24-subtracts"  push the count excluding bookings imported from Beds24,
   *                       for the case where Beds24 itself subtracts its own bookings
   *                       from the number we push (otherwise they are counted twice).
   */
  availMode: process.env.BEDS24_AVAIL_MODE || "absolute",

  enabled: process.env.BEDS24_ENABLED === "true",

  isConfigured() {
    return Boolean(
      this.enabled && this.refreshToken && this.propertyId && this.roomId,
    );
  },

  getStatus() {
    return {
      enabled: this.enabled,
      configured: this.isConfigured(),
      baseUrl: this.baseUrl,
      propertyId: this.propertyId || null,
      roomId: this.roomId || null,
      ariWindowDays: this.ariWindowDays,
      minStay: this.minStay,
      availMode: this.availMode,
      webhookSecretSet: Boolean(this.webhookSecret),
    };
  },
};

module.exports = beds24Config;
