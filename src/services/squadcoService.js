const axios = require("axios");
const crypto = require("crypto");
const paymentConfig = require("../config/paymentConfig");

class SquadcoService {
    constructor() {
        this.config = paymentConfig.squadco;
        this.client = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                Authorization: `Bearer ${this.config.secretKey}`,
                "Content-Type": "application/json",
            },
        });
    }

    async initializeTransaction({ email, amount, reference, metadata = {}, customerName = "" }) {
        try {
            // SquadCo uses Naira directly (not kobo), amount should be in kobo
            const amountInKobo = Math.round(amount * 100);

            const payload = {
                email,
                amount: amountInKobo,
                initiate_type: "inline",
                transaction_ref: reference,
                currency: paymentConfig.currency,
                callback_url: this.config.callbackUrl,
                customer_name: customerName,
                metadata: {
                    ...metadata,
                },
            };

            const response = await this.client.post(
                this.config.endpoints.initialize,
                payload
            );

            // SquadCo returns success in different format
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
            };
        } catch (error) {
            console.error("SquadCo Initialize Error:", error.response?.data || error.message);
            return {
                success: false,
                message: error.response?.data?.message || "Payment initialization failed",
                error: error.response?.data || error.message,
            };
        }
    }
    async verifyTransaction(reference) {
        try {
            const response = await this.client.get(
                `${this.config.endpoints.verify}/${reference}`
            );

            if (response.data.success || response.data.status === 200) {
                const data = response.data.data;

                // Map SquadCo status to standard format
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
                    amount: data.transaction_amount / 100, // Convert back to Naira
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
        try {
            const bodyString = typeof body === "string" ? body : JSON.stringify(body);
            const hash = crypto
                .createHmac("sha512", this.config.secretKey)
                .update(bodyString)
                .digest("hex");

            return hash.toUpperCase() === signature.toUpperCase();
        } catch (error) {
            console.error("Webhook signature verification error:", error);
            return false;
        }
    }

    parseWebhookEvent(body) {
        // SquadCo webhook format
        const data = body.Body || body;

        // Map event type
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
