/**
 * Payment Gateway Configuration
 * Supports Paystack and SquadCo payment gateways
 */

require("dotenv").config();

const paymentConfig = {
  // Default gateway to use if not specified
  defaultGateway: process.env.DEFAULT_PAYMENT_GATEWAY || "paystack",

  // Paystack Configuration
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || "",
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || "",
    baseUrl: "https://api.paystack.co",
    endpoints: {
      initialize: "/transaction/initialize",
      verify: "/transaction/verify",
    },
    // Callback URL after payment - redirects to frontend payment result page
    callbackUrl: process.env.PAYSTACK_CALLBACK_URL || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/result`,
  },

  // SquadCo Configuration
  squadco: {
    apiKey: process.env.SQUADCO_API_KEY || "",
    secretKey: process.env.SQUADCO_SECRET_KEY || "",
    // Use sandbox URL for testing, production URL for live
    baseUrl: process.env.SQUADCO_BASE_URL || "https://sandbox-api-d.squadco.com",
    endpoints: {
      initialize: "/transaction/initiate",
      verify: "/transaction/verify",
    },
    // Callback URL after payment - redirects to frontend payment result page
    callbackUrl: process.env.SQUADCO_CALLBACK_URL || `${process.env.FRONTEND_URL || 'http://localhost:5173'}/payment/result`,
  },

  // Currency settings
  currency: process.env.PAYMENT_CURRENCY || "NGN",

  // Generate unique transaction reference
  generateReference: (prefix = "LUF") => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  },
};

module.exports = paymentConfig;
