

const axios = require("axios");
const crypto = require("crypto");
const paymentConfig = require("../config/paymentConfig");

class PaystackService {
    constructor() {
        this.config = paymentConfig.paystack;
        this.client = axios.create({
            baseURL: this.config.baseUrl,
            headers: {
                Authorization: `Bearer ${this.config.secretKey}`,
                "Content-Type": "application/json",
            },
        });
    }

    async initializeTransaction({ email, amount, reference, metadata = {} }) {
        try {
            // Convert amount to kobo (Paystack uses kobo, not naira)
            const amountInKobo = Math.round(amount * 100);

            const payload = {
                email,
                amount: amountInKobo,
                reference,
                currency: paymentConfig.currency,
                callback_url: this.config.callbackUrl,
                metadata: {
                    ...metadata,
                    custom_fields: [
                        {
                            display_name: "Booking Reference",
                            variable_name: "booking_reference",
                            value: metadata.bookingReference || "",
                        },
                    ],
                },
            };

            const response = await this.client.post(
                this.config.endpoints.initialize,
                payload
            );

            if (response.data.status) {
                return {
                    success: true,
                    authorizationUrl: response.data.data.authorization_url,
                    accessCode: response.data.data.access_code,
                    reference: response.data.data.reference,
                };
            }

            return {
                success: false,
                message: response.data.message || "Failed to initialize transaction",
            };
        } catch (error) {
            console.error("Paystack Initialize Error:", error.response?.data || error.message);
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

            if (response.data.status) {
                const data = response.data.data;
                return {
                    success: true,
                    status: data.status, // success, failed, abandoned
                    amount: data.amount / 100, // Convert back to Naira
                    reference: data.reference,
                    gatewayResponse: data.gateway_response,
                    paidAt: data.paid_at,
                    channel: data.channel,
                    currency: data.currency,
                    customer: data.customer,
                    metadata: data.metadata,
                    rawData: data,
                };
            }

            return {
                success: false,
                message: response.data.message || "Verification failed",
            };
        } catch (error) {
            console.error("Paystack Verify Error:", error.response?.data || error.message);
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

            return hash === signature;
        } catch (error) {
            console.error("Webhook signature verification error:", error);
            return false;
        }
    }


    parseWebhookEvent(body) {
        const event = body.event;
        const data = body.data;

        return {
            event,
            reference: data.reference,
            status: data.status,
            amount: data.amount / 100,
            customer: data.customer,
            metadata: data.metadata,
            paidAt: data.paid_at,
            rawData: data,
        };
    }
}

module.exports = new PaystackService();
