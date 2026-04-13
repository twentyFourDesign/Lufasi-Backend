const axios = require("axios");
const crypto = require("crypto");
const paymentConfig = require("../config/paymentConfig");

class SquadcoService {
    constructor() {
        // Config is read lazily per-request so env vars are always current
    }

    _getConfig() {
        return paymentConfig.squadco;
    }

    _getClient() {
        const config = this._getConfig();
        return axios.create({
            baseURL: config.baseUrl,
            headers: {
                Authorization: `Bearer ${config.secretKey}`,
                "Content-Type": "application/json",
            },
        });
    }

    async initializeTransaction({ email, amount, reference, metadata = {}, customerName = "" }) {
        const config = this._getConfig();
        const client = this._getClient();

        console.log(`[SquadCo] Initializing transaction`);
        console.log(`  - Base URL:     ${config.baseUrl}`);
        console.log(`  - Endpoint:     ${config.endpoints.initialize}`);
        console.log(`  - Secret Key:   ${config.secretKey ? config.secretKey.substring(0, 15) + "..." : "*** EMPTY - CHECK SQUADCO_SECRET_KEY ENV VAR ***"}`);
        console.log(`  - Amount (kobo):${Math.round(amount * 100)}`);
        console.log(`  - Email:        ${email}`);
        console.log(`  - Callback URL: ${config.callbackUrl}`);

        if (!config.secretKey) {
            console.error("[SquadCo] FATAL: SQUADCO_SECRET_KEY is not set!");
            return {
                success: false,
                message: "Payment configuration error: Squad API key is missing. Check SQUADCO_SECRET_KEY env var.",
                error: "Missing SQUADCO_SECRET_KEY",
            };
        }

        try {
            const amountInKobo = Math.round(amount * 100);

            const payload = {
                email,
                amount: amountInKobo,
                initiate_type: "inline",
                transaction_ref: reference,
                currency: paymentConfig.currency,
                callback_url: config.callbackUrl,
                customer_name: customerName,
                metadata: { ...metadata },
            };

            console.log(`[SquadCo] Sending payload:`, JSON.stringify(payload, null, 2));

            const response = await client.post(config.endpoints.initialize, payload);

            console.log(`[SquadCo] Response status: ${response.status}`);
            console.log(`[SquadCo] Response data:`, JSON.stringify(response.data, null, 2));

            if (response.data.success || response.data.status === 200) {
                return {
                    success: true,
                    authorizationUrl: response.data.data.checkout_url,
                    reference: response.data.data.transaction_ref || reference,
                    merchantTransactionRef: response.data.data.merchant_transaction_ref,
                };
            }

            return {
                success: false,
                message: response.data.message || "Failed to initialize transaction",
                error: response.data,
            };
        } catch (error) {
            console.error("[SquadCo] Initialize Error - HTTP Status:", error.response?.status);
            console.error("[SquadCo] Initialize Error - Body:", JSON.stringify(error.response?.data, null, 2));
            console.error("[SquadCo] Initialize Error - Network/other:", error.message);
            const errMsg =
                error.response?.data?.message ||
                (typeof error.response?.data === "string" ? error.response.data : null) ||
                error.message ||
                "Payment initialization failed";
            return {
                success: false,
                message: errMsg,
                error: error.response?.data || error.message,
            };
        }
    }

    async verifyTransaction(reference) {
        const config = this._getConfig();
        const client = this._getClient();
        try {
            const response = await client.get(`${config.endpoints.verify}/${reference}`);

            if (response.data.success || response.data.status === 200) {
                const data = response.data.data;

                let status = "pending";
                if (data.transaction_status === "success" || data.transaction_status === "Success") {
                    status = "success";
                } else if (data.transaction_status === "failed" || data.transaction_status === "Failed") {
                    status = "failed";
                } else if (data.transaction_status === "abandoned" || data.transaction_status === "Abandoned") {
                    status = "abandoned";
                }

                return {
                    success: true,
                    status,
                    amount: data.transaction_amount / 100,
                    reference: data.transaction_ref,
                    gatewayResponse: data.gateway_response || data.transaction_status,
                    paidAt: data.transaction_datetime,
                    channel: data.payment_channel,
                    currency: data.transaction_currency_id,
                    customer: {
                        email: data.email,
                        name: data.customer_name,
                    },
                    metadata: data.meta || {},
                    rawData: data,
                };
            }

            return {
                success: false,
                message: response.data.message || "Verification failed",
            };
        } catch (error) {
            console.error("SquadCo Verify Error:", error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || "Payment verification failed",
                error: error.response?.data || error.message,
            };
        }
    }

    verifyWebhookSignature(signature, body) {
        const config = this._getConfig();
        try {
            const bodyString = typeof body === "string" ? body : JSON.stringify(body);
            const hash = crypto
                .createHmac("sha512", config.secretKey)
                .update(bodyString)
                .digest("hex");
            return hash.toUpperCase() === signature.toUpperCase();
        } catch (error) {
            console.error("Webhook signature verification error:", error);
            return false;
        }
    }

    parseWebhookEvent(body) {
        const data = body.Body || body;

        let event = "unknown";
        if (data.transaction_status === "Success" || data.transaction_status === "success") {
            event = "charge.success";
        } else if (data.transaction_status === "Failed" || data.transaction_status === "failed") {
            event = "charge.failed";
        }

        return {
            event,
            reference: data.transaction_ref,
            status: data.transaction_status?.toLowerCase() || "unknown",
            amount: (data.transaction_amount || 0) / 100,
            customer: {
                email: data.email,
                name: data.customer_name,
            },
            metadata: data.meta || {},
            paidAt: data.transaction_datetime,
            rawData: data,
        };
    }
}

module.exports = new SquadcoService();
