/**
 * Thin Beds24 API v2 client: token handling, rate-limit aware retries, and the
 * few endpoints Lufasi needs.
 *
 * Marked UNVERIFIED where the request or response shape comes from the public
 * documentation but has not been tried against a live account yet.
 */
const axios = require("axios");
const beds24Config = require("../config/beds24Config");

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;
/** Refresh the access token this long before it expires */
const TOKEN_SKEW_MS = 60 * 1000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

class Beds24Service {
  constructor() {
    this.config = beds24Config;
    this.client = axios.create({
      baseURL: this.config.baseUrl,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      timeout: 30000,
    });
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
    this.tokenPromise = null;
  }

  isConfigured() {
    return this.config.isConfigured();
  }

  /**
   * Exchange the refresh token for a short-lived access token.
   * UNVERIFIED: GET /authentication/token with header `refreshToken`,
   * response { token, expiresIn } (seconds).
   */
  async getAccessToken(force = false) {
    const now = Date.now();
    if (!force && this.accessToken && now < this.accessTokenExpiresAt - TOKEN_SKEW_MS) {
      return this.accessToken;
    }
    if (this.tokenPromise) return this.tokenPromise;

    this.tokenPromise = (async () => {
      if (!this.config.refreshToken) {
        throw new Error("Beds24 refresh token not configured");
      }
      try {
        const res = await this.client.get("/authentication/token", {
          headers: { refreshToken: this.config.refreshToken },
        });
        const { token, expiresIn } = res.data || {};
        if (!token) throw new Error("Beds24 returned no access token");
        this.accessToken = token;
        this.accessTokenExpiresAt = Date.now() + (Number(expiresIn) || 3600) * 1000;
        return token;
      } catch (error) {
        this.accessToken = null;
        this.accessTokenExpiresAt = 0;
        throw new Error(`Beds24 token error: ${this.errorMessage(error)}`);
      } finally {
        this.tokenPromise = null;
      }
    })();

    return this.tokenPromise;
  }

  /**
   * One-time: swap an invite code (Settings > Marketplace > API in Beds24) for a
   * refresh token. UNVERIFIED: GET /authentication/setup with header `code`.
   */
  async exchangeInviteCode(inviteCode, deviceName = "Lufasi Lodges") {
    try {
      const res = await this.client.get("/authentication/setup", {
        headers: { code: inviteCode, deviceName },
      });
      return res.data;
    } catch (error) {
      throw new Error(`Beds24 setup error: ${this.errorMessage(error)}`);
    }
  }

  errorMessage(error) {
    const data = error.response?.data;
    return (
      data?.error ||
      data?.message ||
      (typeof data === "string" ? data : null) ||
      error.message
    );
  }

  /**
   * Authenticated request with refresh-on-401 and backoff on 429/5xx.
   * Beds24 allows about 100 credits per 5 minutes; a 429 waits for the reset
   * time when Beds24 reports it (header X-FiveMinCreditLimitResetsIn, UNVERIFIED).
   */
  async request(method, path, { params, data } = {}, attempt = 0, refreshed = false) {
    const token = await this.getAccessToken();

    try {
      const response = await this.client.request({
        method,
        url: path,
        params,
        data,
        headers: { token },
      });
      return response.data;
    } catch (error) {
      const status = error.response?.status;

      if (status === 401 && !refreshed) {
        await this.getAccessToken(true);
        return this.request(method, path, { params, data }, attempt, true);
      }

      const retryable = status === 429 || (status >= 500 && status < 600);
      if (retryable && attempt < MAX_RETRIES) {
        const resetSeconds = Number(
          error.response?.headers?.["x-fivemincreditlimitresetsin"],
        );
        const delay =
          status === 429 && resetSeconds > 0
            ? Math.min(resetSeconds * 1000 + 500, 5 * 60 * 1000)
            : BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(
          `[Beds24] ${method} ${path} failed (${status}), retry ${attempt + 1} in ${delay}ms`,
        );
        await sleep(delay);
        return this.request(method, path, { params, data }, attempt + 1, refreshed);
      }

      throw new Error(`Beds24 API error: ${this.errorMessage(error)}`);
    }
  }

  // --- Inventory ---

  /**
   * Push availability and prices.
   * entries: [{ from, to, numAvail, minStay, price1, price2 }] (dates inclusive).
   * UNVERIFIED body: [{ roomId, calendar: [...] }] to POST /inventory/rooms/calendar.
   */
  async pushCalendar(entries) {
    const body = [{ roomId: Number(this.config.roomId), calendar: entries }];
    return this.request("POST", "/inventory/rooms/calendar", { data: body });
  }

  /**
   * Read back availability and prices, used for drift checks.
   * UNVERIFIED: GET /inventory/rooms/calendar?roomId=&startDate=&endDate=
   * returning data: [{ roomId, calendar: [{ from, to, numAvail, ... }] }].
   */
  async getCalendar({ dateFrom, dateTo }) {
    return this.request("GET", "/inventory/rooms/calendar", {
      params: {
        roomId: this.config.roomId,
        startDate: dateFrom,
        endDate: dateTo,
        includeNumAvail: true,
      },
    });
  }

  // --- Bookings ---

  /**
   * Bookings changed since a time. UNVERIFIED filter name `modifiedFrom`.
   * Fetches every page; Beds24 pages results ("pages.nextPageExists" /
   * "page" param, UNVERIFIED).
   */
  async getBookingsModifiedSince(modifiedFrom) {
    const all = [];
    for (let page = 1; page <= 50; page++) {
      const res = await this.request("GET", "/bookings", {
        params: {
          propertyId: this.config.propertyId,
          modifiedFrom,
          includeCancelled: true,
          page,
        },
      });
      const rows = Array.isArray(res) ? res : res?.data || [];
      all.push(...rows);
      const more = res?.pages?.nextPageExists ?? res?.pages?.next;
      if (!more) break;
    }
    return all;
  }

  async getBooking(id) {
    const res = await this.request("GET", "/bookings", {
      params: { id, includeCancelled: true },
    });
    const rows = Array.isArray(res) ? res : res?.data || [];
    return rows[0] || null;
  }
}

module.exports = new Beds24Service();
