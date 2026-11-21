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

  /**
   * OTA tax gross-up. Direct bookings pay base x (1 + directTaxPercent/100). If an OTA
   * extranet cannot be set to the same total tax (e.g. Booking.com locks VAT at 5%),
   * the price pushed to Beds24 is raised by (1+direct)/(1+ota) so the guest still pays
   * the same total as on the website. Both default to 0 => factor 1 => no change.
   *   BEDS24_DIRECT_TAX_PERCENT  e.g. 15   (12.5% VAT + 2.5% service charge)
   *   BEDS24_OTA_TAX_PERCENT     e.g. 7.5  (what the OTA extranet will add: 5% VAT + 2.5% SC)
   */
  directTaxPercent: Number(process.env.BEDS24_DIRECT_TAX_PERCENT) || 0,
  otaTaxPercent: Number(process.env.BEDS24_OTA_TAX_PERCENT) || 0,

  getOtaPriceFactor() {
    const d = Number(this.directTaxPercent) || 0;
    const o = Number(this.otaTaxPercent) || 0;
    if (d <= 0 || o <= 0) return 1;
    return (1 + d / 100) / (1 + o / 100);
  },

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
      otaPriceFactor: Number(this.getOtaPriceFactor().toFixed(5)),
      directTaxPercent: this.directTaxPercent,
      otaTaxPercent: this.otaTaxPercent,
      webhookSecretSet: Boolean(this.webhookSecret),
    };
  },
};

module.exports = beds24Config;
