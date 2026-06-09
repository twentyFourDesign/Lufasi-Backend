const axios = require("axios");
const crypto = require("crypto");
const channexConfig = require("../config/channexConfig");

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class ChannexService {
  constructor() {
    this.config = channexConfig;
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: {
        "user-api-key": this.config.apiKey,
        "Content-Type": "application/json",
      },
      timeout: 30000,
    });
  }

  isConfigured() {
    return this.config.isConfigured();
  }

  /**
   * Convert NGN amount to Channex integer format (kobo / smallest unit).
   */
  toChannexRate(amountNgn) {
    return Math.round(Number(amountNgn) * 100);
  }

  async request(method, path, data, attempt = 0) {
    if (!this.config.apiKey) {
      throw new Error("Channex API key not configured");
    }

    try {
      const response = await this.client.request({ method, url: path, data });
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const retryable = status === 429 || (status >= 500 && status < 600);

      if (retryable && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[Channex] ${method} ${path} failed (${status}), retry ${attempt + 1} in ${delay}ms`,
        );
        await sleep(delay);
        return this.request(method, path, data, attempt + 1);
      }

      const msg =
        error.response?.data?.errors?.title ||
        error.response?.data?.message ||
        error.message;
      throw new Error(`Channex API error: ${msg}`);
    }
  }

  // --- ARI ---

  async pushAvailability(values) {
    return this.request("POST", "/availability", { values });
  }

  async pushRestrictions(values) {
    return this.request("POST", "/restrictions", { values });
  }

  async getAvailability({ dateFrom, dateTo }) {
    const params = new URLSearchParams({
      "filter[property_id]": this.config.propertyId,
      "filter[date][gte]": dateFrom,
      "filter[date][lte]": dateTo,
    });
    return this.request("GET", `/availability?${params}`);
  }

  async getRestrictions({ dateFrom, dateTo }) {
    const params = new URLSearchParams({
      "filter[property_id]": this.config.propertyId,
      "filter[date][gte]": dateFrom,
      "filter[date][lte]": dateTo,
      "filter[restrictions]": "rate,availability",
    });
    return this.request("GET", `/restrictions?${params}`);
  }

  // --- Bookings ---

  async getBookingRevisionFeed(propertyId) {
    const pid = propertyId || this.config.propertyId;
    const params = pid ? `?filter[property_id]=${pid}` : "";
    return this.request("GET", `/booking_revisions/feed${params}`);
  }

  async getBookingRevision(revisionId) {
    return this.request("GET", `/booking_revisions/${revisionId}`);
  }

  async acknowledgeBookingRevision(revisionId) {
    return this.request("POST", `/booking_revisions/${revisionId}/ack`, {});
  }

  // --- Webhook verification ---

  verifyWebhookSignature(signature, rawBody) {
    if (!this.config.webhookSecret) return true; // dev mode
    const expected = crypto
      .createHmac("sha256", this.config.webhookSecret)
      .update(rawBody)
      .digest("hex");
    const sigBuf = Buffer.from(signature || "");
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length) return false;
    return crypto.timingSafeEqual(sigBuf, expBuf);
  }
}

module.exports = new ChannexService();
