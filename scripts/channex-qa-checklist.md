# Channex Integration QA Checklist

## Prerequisites
1. Sign up at https://staging.channex.io
2. Create API key (User Profile → API Keys)
3. Create Property, Room Type ("Geodesic Dome", count 6), Rate Plan
4. Connect Booking.com test channel in Channex extranet
5. Set backend `.env`:
   ```
   CHANNEX_ENABLED=true
   CHANNEX_API_KEY=<your-key>
   CHANNEX_BASE_URL=https://staging.channex.io/api/v1
   CHANNEX_PROPERTY_ID=<uuid>
   CHANNEX_ROOM_TYPE_ID=<uuid>
   CHANNEX_RATE_PLAN_ID=<uuid>
   CHANNEX_WEBHOOK_SECRET=<optional>
   CHANNEX_ARI_WINDOW_DAYS=365
   ```

## Outbound ARI (Lufasi → Channex → Booking.com)
- [ ] Admin → Channel Manager → "Push Rates & Availability" succeeds
- [ ] Preview table shows correct availability (0–6) per date
- [ ] Preview rates match Pricing config (peak Fri-Sat, off-peak Sun-Thu, seasonal %)
- [ ] Rates are ex-VAT (net) as configured
- [ ] After web booking created, availability decreases on Channex
- [ ] After booking cancelled/expired, availability increases on Channex
- [ ] After pricing save, rates re-push automatically

## Inbound Bookings (Booking.com → Channex → Lufasi)
- [ ] Create test booking on Booking.com test account
- [ ] "Pull OTA Bookings" imports reservation
- [ ] Local booking created with `booking_source = booking.com`
- [ ] Calendar availability updated (pods reserved)
- [ ] Channex revision acknowledged (no warning emails)
- [ ] Modified booking updates local record
- [ ] Cancelled booking frees availability

## Concurrency / Anti-double-booking
- [ ] Run `node scripts/channex-load-test.js` — must PASS
- [ ] Simultaneous web booking + OTA import on same dates — no oversell
- [ ] Pending bookings expire every 5 min (scheduler) and free inventory

## Reconciliation
- [ ] Nightly full ARI sync runs at 02:00
- [ ] Drift detection at 03:00 sends admin email if mismatch
- [ ] Auto-heal push corrects drift

## Channex PMS Certification
- [ ] Complete tests at https://docs.channex.io/api-v.1-documentation/pms-certification-tests
- [ ] Email results to support@channex.io
