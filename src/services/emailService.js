

const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const emailConfig = require("../config/emailConfig");

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  initialize() {
    if (!emailConfig.isConfigured()) {
      console.warn("Email service not configured. Emails will not be sent.");
      return false;
    }

    try {
      this.transporter = nodemailer.createTransport(
        emailConfig.getTransportConfig()
      );
      this.initialized = true;
      return true;
    } catch (error) {
      console.error("Failed to initialize email service:", error.message);
      return false;
    }
  }

  async verify() {
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.transporter) {
      return { success: false, message: "Email service not configured" };
    }

    try {
      await this.transporter.verify();
      return { success: true, message: "Email service is ready" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }
  async sendEmail({ to, subject, html, text }) {
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.transporter) {
      console.warn("Email not sent - service not configured");
      return { success: false, message: "Email service not configured" };
    }

    try {
      const mailOptions = {
        from: emailConfig.getFromAddress(),
        to,
        subject,
        html,
        text: text || this.htmlToText(html),
      };

      const info = await this.transporter.sendMail(mailOptions);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`Failed to send email to ${to}:`, error.message);
      return { success: false, message: error.message };
    }
  }

  async sendBookingConfirmation(booking, guest, pod) {
    if (!emailConfig.enabled.bookingConfirmation) {
      return { success: false, message: "Booking confirmation emails disabled" };
    }

    const subject = `Booking Confirmation - ${booking.bookingReference}`;
    const html = this.generateBookingConfirmationEmail(booking, guest, pod);

    return this.sendEmail({
      to: guest.email,
      subject,
      html,
    });
  }

  async sendPaymentSuccess(booking, guest, payment) {
    if (!emailConfig.enabled.paymentSuccess) {
      return { success: false, message: "Payment success emails disabled" };
    }

    const subject = `Payment Confirmed - ${booking.bookingReference}`;
    const html = this.generatePaymentSuccessEmail(booking, guest, payment);

    return this.sendEmail({
      to: guest.email,
      subject,
      html,
    });
  }


  async sendPaymentFailed(booking, guest) {
    if (!emailConfig.enabled.paymentFailed) {
      return { success: false, message: "Payment failed emails disabled" };
    }

    const subject = `Payment Failed - ${booking.bookingReference}`;
    const html = this.generatePaymentFailedEmail(booking, guest);

    return this.sendEmail({
      to: guest.email,
      subject,
      html,
    });
  }

  async sendBookingCancellation(booking, guest, pod, refundStatus = "Pending Review") {
    if (!this.initialized) {
      this.initialize();
    }

    const subject = `Booking Cancelled - ${booking.bookingReference}`;
    const html = this.generateBookingCancellationEmail(booking, guest, pod, refundStatus);

    return this.sendEmail({
      to: guest.email,
      subject,
      html,
    });
  }

  async sendAdminBookingAlert(booking, guest, pod) {
    if (!emailConfig.enabled.adminAlerts) {
      return { success: false, message: "Admin alerts disabled" };
    }

    if (!this.initialized) {
      this.initialize();
    }

    const subject = `New Booking Confirmed - ${booking.bookingReference}`;
    const html = this.generateAdminBookingAlertEmail(booking, guest, pod);

    return this.sendEmail({
      to: emailConfig.adminEmail,
      subject,
      html,
    });
  }

  async sendAdminCancellationAlert(booking, guest, pod) {
    if (!emailConfig.enabled.adminAlerts) {
      return { success: false, message: "Admin alerts disabled" };
    }

    if (!this.initialized) {
      this.initialize();
    }

    const subject = `Booking Cancelled - ${booking.bookingReference}`;
    const html = this.generateAdminCancellationAlertEmail(booking, guest, pod);

    return this.sendEmail({
      to: emailConfig.adminEmail,
      subject,
      html,
    });
  }

  generateBookingConfirmationEmail(booking, guest, pod) {
    try {
      const templatePath = path.join(__dirname, "../templates/booking-confirmation.html");
      let html = fs.readFileSync(templatePath, "utf8");

      const checkInDate = new Date(booking.checkIn).toLocaleDateString("en-US", {
        weekday: "short", day: "numeric", month: "long", year: "numeric"
      });
      const checkOutDate = new Date(booking.checkOut).toLocaleDateString("en-US", {
        weekday: "short", day: "numeric", month: "long", year: "numeric"
      });

      // Calculate nights
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)) || 1;

      // Calculate costs
      const totalPrice = parseFloat(booking.totalPrice || 0);
      const subTotal = totalPrice * 0.9; // Approximate
      const vat = totalPrice * 0.075; // 7.5% VAT
      const extrasAmount = parseFloat(booking.extrasAmount || 0);
      const discount = parseFloat(booking.discount || 0);

      // Guest counts
      const adults = booking.adults || 1;
      const children = booking.children || 0;
      const infants = booking.infants || 0;
      const visitors = `${adults + children + infants} Guests`;

      // Get base URL from environment
      const appBaseUrl = process.env.APP_BASE_URL;

      // Replace placeholders
      html = html.replace(/{{bookingReference}}/g, booking.bookingReference)
        .replace(/{{guestName}}/g, guest.fullName)
        .replace(/{{podName}}/g, pod?.title || pod?.podName || "Lufasi Lodge")
        .replace(/{{checkInDate}}/g, checkInDate)
        .replace(/{{checkOutDate}}/g, checkOutDate)
        .replace(/{{nights}}/g, nights)
        .replace(/{{mealPlan}}/g, booking.mealPlan || "Full board")
        .replace(/{{visitors}}/g, visitors)
        .replace(/{{adults}}/g, adults)
        .replace(/{{children}}/g, children)
        .replace(/{{extras}}/g, booking.extras || "N/A")
        .replace(/{{subTotal}}/g, subTotal.toLocaleString())
        .replace(/{{discount}}/g, discount.toLocaleString())
        .replace(/{{extrasAmount}}/g, extrasAmount.toLocaleString())
        .replace(/{{vat}}/g, vat.toLocaleString())
        .replace(/{{totalPrice}}/g, totalPrice.toLocaleString())
        .replace(/{{appBaseUrl}}/g, appBaseUrl);

      return html;
    } catch (err) {
      console.error("Error generating confirmation email template:", err);
      // Fallback to simple text if template fails
      return `Booking Confirmed! Ref: ${booking.bookingReference}`;
    }
  }

  generateBookingCancellationEmail(booking, guest, pod, refundStatus) {
    try {
      const templatePath = path.join(__dirname, "../templates/booking-cancellation.html");
      let html = fs.readFileSync(templatePath, "utf8");

      const checkInDate = new Date(booking.checkIn).toLocaleDateString("en-US", {
        weekday: "short", day: "numeric", month: "long", year: "numeric"
      });
      const checkOutDate = new Date(booking.checkOut).toLocaleDateString("en-US", {
        weekday: "short", day: "numeric", month: "long", year: "numeric"
      });

      // Calculate nights
      const checkIn = new Date(booking.checkIn);
      const checkOut = new Date(booking.checkOut);
      const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)) || 1;

      // Calculate costs
      const totalPrice = parseFloat(booking.totalPrice || 0);
      const subTotal = totalPrice * 0.9; // Approximate
      const vat = totalPrice * 0.075; // 7.5% VAT
      const extrasAmount = parseFloat(booking.extrasAmount || 0);
      const discount = parseFloat(booking.discount || 0);

      // Guest counts
      const adults = booking.adults || 1;
      const children = booking.children || 0;
      const infants = booking.infants || 0;
      const visitors = `${adults + children + infants} Guests`;

      // Get base URL from environment
      const appBaseUrl = process.env.APP_BASE_URL || "https://lufasilodges.com";

      // Replace placeholders
      html = html.replace(/{{bookingReference}}/g, booking.bookingReference)
        .replace(/{{guestName}}/g, guest.fullName)
        .replace(/{{guestEmail}}/g, guest.email)
        .replace(/{{podName}}/g, pod?.title || pod?.podName || "Lufasi Lodge")
        .replace(/{{checkInDate}}/g, checkInDate)
        .replace(/{{checkOutDate}}/g, checkOutDate)
        .replace(/{{nights}}/g, nights)
        .replace(/{{mealPlan}}/g, booking.mealPlan || "Full board")
        .replace(/{{visitors}}/g, visitors)
        .replace(/{{adults}}/g, adults)
        .replace(/{{children}}/g, children)
        .replace(/{{extras}}/g, booking.extras || "N/A")
        .replace(/{{subTotal}}/g, subTotal.toLocaleString())
        .replace(/{{discount}}/g, discount.toLocaleString())
        .replace(/{{extrasAmount}}/g, extrasAmount.toLocaleString())
        .replace(/{{vat}}/g, vat.toLocaleString())
        .replace(/{{refundStatus}}/g, refundStatus || "Pending Review")
        .replace(/{{refundAmount}}/g, totalPrice.toLocaleString())
        .replace(/{{totalPrice}}/g, totalPrice.toLocaleString())
        .replace(/{{appBaseUrl}}/g, appBaseUrl);

      return html;
    } catch (err) {
      console.error("Error generating cancellation email template:", err);
      return `Booking Cancelled. Ref: ${booking.bookingReference}`;
    }
  }

  generatePaymentSuccessEmail(booking, guest, payment) {
    const paymentDate = new Date().toLocaleDateString("en-US", {
      weekday: "short", day: "numeric", month: "long", year: "numeric"
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Confirmed</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f5; font-family: 'Arial', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a4a1a 0%, #2d5a27 100%); padding: 20px; text-align: center;">
              <img src="https://lufasi.org/wp-content/uploads/2024/01/Lufasi-Logo-White.png" alt="Lufasi Lodges"
                style="height: 50px; width: auto;" />
            </td>
          </tr>

          <!-- Success Icon & Title -->
          <tr>
            <td style="text-align: center; padding: 30px 20px 15px;">
              <div style="display: inline-block; width: 60px; height: 60px; background: #e8f5e9; border-radius: 50%; line-height: 60px; margin-bottom: 15px;">
                <span style="font-size: 28px; color: #2e7d32;">✓</span>
              </div>
              <h2 style="color: #1a1a1a; margin: 0; font-size: 28px; font-weight: 700;">Payment Confirmed</h2>
            </td>
          </tr>

          <!-- Intro Text -->
          <tr>
            <td style="padding: 15px 40px; text-align: center; color: #666; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0;">Dear <strong>${guest.fullName}</strong>, your payment has been successfully processed. Your booking is now confirmed!</p>
            </td>
          </tr>

          <!-- Payment Details Card -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="background: #fafafa; border: 1px solid #eee; border-radius: 16px; padding: 25px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                <h3 style="margin: 0 0 20px 0; font-size: 18px; text-align: center; color: #333; border-bottom: 2px solid #e0f2f1; padding-bottom: 15px;">
                  Payment Details</h3>
                
                <!-- Booking Reference -->
                <div style="margin-bottom: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 14px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="40" valign="top">
                        <span style="font-size: 20px;">🎫</span>
                      </td>
                      <td>
                        <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Booking Reference</div>
                        <div style="color: #333; font-weight: 600; font-size: 15px;">${booking.bookingReference}</div>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Amount Paid -->
                <div style="margin-bottom: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 14px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="40" valign="top">
                        <span style="font-size: 20px;">💰</span>
                      </td>
                      <td>
                        <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Amount Paid</div>
                        <div style="color: #2e7d32; font-weight: 600; font-size: 15px;">₦${parseFloat(payment?.amount || booking.totalPrice).toLocaleString()}</div>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Transaction Reference -->
                <div style="margin-bottom: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 14px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="40" valign="top">
                        <span style="font-size: 20px;">📝</span>
                      </td>
                      <td>
                        <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Transaction Reference</div>
                        <div style="color: #333; font-weight: 600; font-size: 15px;">${payment?.transactionReference || "N/A"}</div>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Payment Date -->
                <div style="margin-bottom: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 14px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="40" valign="top">
                        <span style="font-size: 20px;">📅</span>
                      </td>
                      <td>
                        <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Payment Date</div>
                        <div style="color: #333; font-weight: 600; font-size: 15px;">${paymentDate}</div>
                      </td>
                    </tr>
                  </table>
                </div>

              </div>
            </td>
          </tr>

          <!-- Next Steps -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background: #e8f5e9; border-radius: 12px; padding: 20px; border-left: 4px solid #4caf50;">
                <h4 style="margin: 0 0 12px 0; color: #2e7d32; font-size: 16px;">✅ What's Next?</h4>
                <ul style="margin: 0; padding-left: 20px; color: #666; font-size: 13px; line-height: 1.8;">
                  <li>You will receive a booking confirmation email with all details</li>
                  <li>Save your booking reference for check-in</li>
                  <li>Contact us if you have any questions</li>
                </ul>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #004d40 0%, #00695c 100%); color: #fff; padding: 25px 40px; text-align: center;">
              <p style="margin: 0 0 10px 0; font-size: 14px;">We look forward to welcoming you at Lufasi Lodges!</p>
              <p style="margin: 0; font-size: 11px; color: #80cbc4;">© ${new Date().getFullYear()} Lufasi Lodges. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }


  /**
   * Generate payment failed email HTML
   */
  generatePaymentFailedEmail(booking, guest) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Payment Failed</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f5; font-family: 'Arial', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header with Logo -->
          <tr>
            <td style="background: linear-gradient(135deg, #c62828 0%, #dc3545 100%); padding: 20px; text-align: center;">
              <img src="https://lufasi.org/wp-content/uploads/2024/01/Lufasi-Logo-White.png" alt="Lufasi Lodges"
                style="height: 50px; width: auto;" />
            </td>
          </tr>

          <!-- Error Icon & Title -->
          <tr>
            <td style="text-align: center; padding: 30px 20px 15px;">
              <div style="display: inline-block; width: 60px; height: 60px; background: #ffebee; border-radius: 50%; line-height: 60px; margin-bottom: 15px;">
                <span style="font-size: 28px; color: #c62828;">✗</span>
              </div>
              <h2 style="color: #1a1a1a; margin: 0; font-size: 28px; font-weight: 700;">Payment Failed</h2>
            </td>
          </tr>

          <!-- Intro Text -->
          <tr>
            <td style="padding: 15px 40px; text-align: center; color: #666; font-size: 14px; line-height: 1.6;">
              <p style="margin: 0;">Dear <strong>${guest.fullName}</strong>, unfortunately your payment for booking <strong>${booking.bookingReference}</strong> was not successful.</p>
            </td>
          </tr>

          <!-- Payment Details Card -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="background: #fafafa; border: 1px solid #eee; border-radius: 16px; padding: 25px; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">
                
                <!-- Booking Reference -->
                <div style="margin-bottom: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 14px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="40" valign="top">
                        <span style="font-size: 20px;">🎫</span>
                      </td>
                      <td>
                        <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Booking Reference</div>
                        <div style="color: #333; font-weight: 600; font-size: 15px;">${booking.bookingReference}</div>
                      </td>
                    </tr>
                  </table>
                </div>

                <!-- Amount Due -->
                <div style="margin-bottom: 12px; background: #fff; border: 1px solid #f0f0f0; border-radius: 10px; padding: 14px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="40" valign="top">
                        <span style="font-size: 20px;">💰</span>
                      </td>
                      <td>
                        <div style="color: #888; font-size: 11px; text-transform: uppercase; margin-bottom: 4px;">Amount Due</div>
                        <div style="color: #c62828; font-weight: 600; font-size: 15px;">₦${parseFloat(booking.totalPrice).toLocaleString()}</div>
                      </td>
                    </tr>
                  </table>
                </div>

              </div>
            </td>
          </tr>

          <!-- Retry Button -->
          <tr>
            <td style="padding: 0 40px 20px; text-align: center;">
              <a href="${process.env.APP_BASE_URL}/payments/initialize?bookingId=${booking.id}"
                style="display: inline-block; background: linear-gradient(135deg, #1a4a1a 0%, #2d5a27 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                Retry Payment
              </a>
            </td>
          </tr>

          <!-- Help Section -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <div style="background: #fff3e0; border-radius: 12px; padding: 20px; border-left: 4px solid #ff9800;">
                <h4 style="margin: 0 0 12px 0; color: #e65100; font-size: 16px;">💡 Need Help?</h4>
                <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.7;">
                  If you continue to experience issues, please contact us at <strong>info@lufasi.com</strong> or call <strong>+234 812 345 6789</strong>.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #004d40 0%, #00695c 100%); color: #fff; padding: 25px 40px; text-align: center;">
              <p style="margin: 0 0 10px 0; font-size: 14px;">Your booking is still reserved. Please retry payment to confirm.</p>
              <p style="margin: 0; font-size: 11px; color: #80cbc4;">© ${new Date().getFullYear()} Lufasi Lodges. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }


  generateAdminBookingAlertEmail(booking, guest, pod) {
    const checkInDate = new Date(booking.checkIn).toLocaleDateString("en-US", {
      weekday: "short", day: "numeric", month: "long", year: "numeric"
    });
    const checkOutDate = new Date(booking.checkOut).toLocaleDateString("en-US", {
      weekday: "short", day: "numeric", month: "long", year: "numeric"
    });

    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)) || 1;

    const totalPrice = parseFloat(booking.totalPrice || 0);
    const adults = booking.adults || 1;
    const children = booking.children || 0;
    const infants = booking.infants || 0;

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>New Booking Alert</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f5; font-family: 'Arial', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #1565c0 0%, #1976d2 100%); padding: 30px; text-align: center;">
              <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: 700;">🔔 New Booking Confirmed</h1>
            </td>
          </tr>

          <!-- Alert Message -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background: #e3f2fd; border-bottom: 3px solid #1976d2;">
              <p style="margin: 0; color: #1565c0; font-size: 16px; font-weight: 600;">A new booking has been confirmed and paid</p>
            </td>
          </tr>

          <!-- Booking Reference -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 18px; border-radius: 12px; text-align: center; border-left: 4px solid #ff9800;">
                <span style="color: #e65100; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Booking Reference</span>
                <div style="color: #e65100; font-weight: 700; font-size: 24px; margin-top: 5px; letter-spacing: 2px;">${booking.bookingReference}</div>
              </div>
            </td>
          </tr>

          <!-- Guest Information -->
          <tr>
            <td style="padding: 10px 40px;">
              <h3 style="margin: 0 0 15px 0; color: #1565c0; font-size: 18px; border-bottom: 2px solid #e3f2fd; padding-bottom: 10px;">Guest Information</h3>
              <table width="100%" cellpadding="8" cellspacing="0">
                <tr>
                  <td style="color: #666; font-size: 14px; width: 40%;">Name:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${guest.fullName}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Email:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${guest.email}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Phone:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${guest.phone || "N/A"}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Booking Details -->
          <tr>
            <td style="padding: 10px 40px;">
              <h3 style="margin: 0 0 15px 0; color: #1565c0; font-size: 18px; border-bottom: 2px solid #e3f2fd; padding-bottom: 10px;">Booking Details</h3>
              <table width="100%" cellpadding="8" cellspacing="0">
                <tr>
                  <td style="color: #666; font-size: 14px; width: 40%;">Pod:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${pod?.title || pod?.podName || "N/A"}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Check-in:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${checkInDate}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Check-out:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${checkOutDate}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Nights:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${nights}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Guests:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${adults} Adults, ${children} Children, ${infants} Infants</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Meal Plan:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${booking.mealPlan || booking.boardType || "N/A"}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Payment Information -->
          <tr>
            <td style="padding: 10px 40px 30px;">
              <div style="background: #e8f5e9; border-radius: 12px; padding: 20px; border-left: 4px solid #4caf50;">
                <table width="100%" cellpadding="5" cellspacing="0">
                  <tr>
                    <td style="color: #2e7d32; font-size: 14px; font-weight: 600;">Payment Status:</td>
                    <td align="right" style="color: #2e7d32; font-weight: 700; font-size: 14px;">✓ PAID</td>
                  </tr>
                  <tr>
                    <td style="color: #2e7d32; font-size: 16px; font-weight: 700; padding-top: 10px;">Total Amount:</td>
                    <td align="right" style="color: #2e7d32; font-weight: 700; font-size: 20px; padding-top: 10px;">₦${totalPrice.toLocaleString()}</td>
                  </tr>
                </table>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f5f5f5; padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #666; font-size: 12px;">This is an automated admin notification from Lufasi Lodges</p>
              <p style="margin: 5px 0 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Lufasi Lodges. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  generateAdminCancellationAlertEmail(booking, guest, pod) {
    const checkInDate = new Date(booking.checkIn).toLocaleDateString("en-US", {
      weekday: "short", day: "numeric", month: "long", year: "numeric"
    });
    const checkOutDate = new Date(booking.checkOut).toLocaleDateString("en-US", {
      weekday: "short", day: "numeric", month: "long", year: "numeric"
    });

    const checkIn = new Date(booking.checkIn);
    const checkOut = new Date(booking.checkOut);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24)) || 1;

    const totalPrice = parseFloat(booking.totalPrice || 0);
    const adults = booking.adults || 1;
    const children = booking.children || 0;
    const infants = booking.infants || 0;
    const cancelledAt = new Date().toLocaleDateString("en-US", {
      weekday: "short", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Booking Cancellation Alert</title>
</head>
<body style="margin: 0; padding: 0; background: #f5f5f5; font-family: 'Arial', sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding: 20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #c62828 0%, #d32f2f 100%); padding: 30px; text-align: center;">
              <h1 style="color: #fff; margin: 0; font-size: 24px; font-weight: 700;">⚠️ Booking Cancelled</h1>
            </td>
          </tr>

          <!-- Alert Message -->
          <tr>
            <td style="padding: 20px 40px; text-align: center; background: #ffebee; border-bottom: 3px solid #d32f2f;">
              <p style="margin: 0; color: #c62828; font-size: 16px; font-weight: 600;">A booking has been cancelled</p>
            </td>
          </tr>

          <!-- Booking Reference -->
          <tr>
            <td style="padding: 20px 40px;">
              <div style="background: linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%); padding: 18px; border-radius: 12px; text-align: center; border-left: 4px solid #ff9800;">
                <span style="color: #e65100; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; font-weight: 600;">Booking Reference</span>
                <div style="color: #e65100; font-weight: 700; font-size: 24px; margin-top: 5px; letter-spacing: 2px;">${booking.bookingReference}</div>
              </div>
            </td>
          </tr>

          <!-- Cancellation Info -->
          <tr>
            <td style="padding: 10px 40px;">
              <div style="background: #ffebee; border-radius: 8px; padding: 12px; text-align: center;">
                <span style="color: #c62828; font-size: 13px; font-weight: 600;">Cancelled on: ${cancelledAt}</span>
              </div>
            </td>
          </tr>

          <!-- Guest Information -->
          <tr>
            <td style="padding: 10px 40px;">
              <h3 style="margin: 0 0 15px 0; color: #c62828; font-size: 18px; border-bottom: 2px solid #ffebee; padding-bottom: 10px;">Guest Information</h3>
              <table width="100%" cellpadding="8" cellspacing="0">
                <tr>
                  <td style="color: #666; font-size: 14px; width: 40%;">Name:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${guest.fullName}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Email:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${guest.email}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Phone:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${guest.phone || "N/A"}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Booking Details -->
          <tr>
            <td style="padding: 10px 40px;">
              <h3 style="margin: 0 0 15px 0; color: #c62828; font-size: 18px; border-bottom: 2px solid #ffebee; padding-bottom: 10px;">Cancelled Booking Details</h3>
              <table width="100%" cellpadding="8" cellspacing="0">
                <tr>
                  <td style="color: #666; font-size: 14px; width: 40%;">Pod:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${pod?.title || pod?.podName || "N/A"}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Check-in:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${checkInDate}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Check-out:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${checkOutDate}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Nights:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${nights}</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Guests:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">${adults} Adults, ${children} Children, ${infants} Infants</td>
                </tr>
                <tr>
                  <td style="color: #666; font-size: 14px;">Total Amount:</td>
                  <td style="color: #333; font-weight: 600; font-size: 14px;">₦${totalPrice.toLocaleString()}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Action Required -->
          <tr>
            <td style="padding: 10px 40px 30px;">
              <div style="background: #fff3e0; border-radius: 12px; padding: 20px; border-left: 4px solid #ff9800;">
                <h4 style="margin: 0 0 10px 0; color: #e65100; font-size: 16px;">⚡ Action Required</h4>
                <p style="margin: 0; color: #666; font-size: 13px; line-height: 1.6;">
                  Please review this cancellation and process any refund if applicable according to the cancellation policy.
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f5f5f5; padding: 20px 40px; text-align: center; border-top: 1px solid #e0e0e0;">
              <p style="margin: 0; color: #666; font-size: 12px;">This is an automated admin notification from Lufasi Lodges</p>
              <p style="margin: 5px 0 0; color: #999; font-size: 11px;">© ${new Date().getFullYear()} Lufasi Lodges. All rights reserved.</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }



  htmlToText(html) {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

// Export singleton instance
module.exports = new EmailService();
