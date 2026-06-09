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

  /** Push net rates (ex-VAT) to OTAs — matches GA4 convention */
  ratesExVat: process.env.CHANNEX_RATES_EX_VAT !== "false",
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
