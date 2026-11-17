/**
 * Channex channel manager configuration.
 * Set these env vars once the client creates their Channex property/room/rate plan.
 */
const channexConfig = {
  apiKey: process.env.CHANNEX_API_KEY || "",
  baseUrl:
    process.env.CHANNEX_BASE_URL || "https://staging.channex.io/api/v1",
  webhookSecret: process.env.CHANNEX_WEBHOOK_SECRET || "",

  propertyId: process.env.CHANNEX_PROPERTY_ID || "",
  roomTypeId: process.env.CHANNEX_ROOM_TYPE_ID || "",
  ratePlanId: process.env.CHANNEX_RATE_PLAN_ID || "",

  /** Rolling window (days) for ARI pushes */
  ariWindowDays: Number(process.env.CHANNEX_ARI_WINDOW_DAYS) || 365,

  /**
   * Lufasi's configured base prices are already pre-tax: checkout adds 12.5% VAT
   * and 2.5% service charge on top. Push them unchanged and let each OTA apply
   * the same taxes. Opt in to dividing by (1 + vatRate) only with
   * CHANNEX_RATES_EX_VAT=true.
   */
  ratesExVat: process.env.CHANNEX_RATES_EX_VAT === "true",
  vatRate: Number(process.env.VAT_RATE) || 0.125,

  /** Minimum stay published to OTAs */
  minStay: Number(process.env.CHANNEX_MIN_STAY) || 1,

  enabled: process.env.CHANNEX_ENABLED === "true",

  isConfigured() {
    return Boolean(
      this.enabled &&
        this.apiKey &&
        this.propertyId &&
        this.roomTypeId &&
        this.ratePlanId,
    );
  },

  getStatus() {
    return {
      enabled: this.enabled,
      configured: this.isConfigured(),
      baseUrl: this.baseUrl,
      propertyId: this.propertyId || null,
      roomTypeId: this.roomTypeId || null,
      ratePlanId: this.ratePlanId || null,
      ariWindowDays: this.ariWindowDays,
      ratesExVat: this.ratesExVat,
      minStay: this.minStay,
    };
  },
};

module.exports = channexConfig;
