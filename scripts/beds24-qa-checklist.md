# Beds24 Integration QA Checklist

Everything marked UNVERIFIED in the code was written from Beds24's public
documentation and has not been tried against a live account. Do sections 1-3
first; they settle those assumptions.

## 0. Setup
1. Beds24: create the property, one room "Geodesic Dome" with **quantity 6**, connect Booking.com / Expedia (or test channels).
2. Beds24: Settings > Marketplace > API > generate an invite code (bookings read, inventory read+write, properties read).
3. `node scripts/beds24-setup.js <INVITE_CODE>` and copy the refresh token.
4. Set `BEDS24_ENABLED=true`, `BEDS24_REFRESH_TOKEN`, then `node scripts/beds24-setup.js --list` for `BEDS24_PROPERTY_ID` and `BEDS24_ROOM_ID`.
5. Set `BEDS24_WEBHOOK_SECRET` and keep `CHANNEX_ENABLED=false`.

## 1. Connection (UNVERIFIED: token endpoints)
- [ ] `--list` prints the property and the dome room with 6 units
- [ ] `GET /admin/beds24/status` shows `configured: true`

## 2. Outbound availability and prices (UNVERIFIED: calendar body)
- [ ] `GET /admin/beds24/preview` shows availability 0-6 and prices per date
- [ ] `POST /admin/beds24/push-ari` succeeds; the Beds24 calendar shows the same counts and prices
- [ ] Prices equal Lufasi's pre-tax base price (Fri-Sat peak, Sun-Thu off-peak, seasonal %)
- [ ] **Double-counting test:** import or create a Beds24 test booking, then check the count Beds24 shows.
  - Beds24 shows Lufasi's count unchanged: keep `BEDS24_AVAIL_MODE=absolute`.
  - Beds24 shows one fewer than Lufasi's count: set `BEDS24_AVAIL_MODE=beds24-subtracts`.
- [ ] Extranet taxes set to 12.5% VAT + 2.5% service charge; OTA total equals the direct total for the same stay
- [ ] Child ages and charges defined in each OTA extranet
- [ ] A web booking lowers Beds24 availability within seconds
- [ ] Cancelling or expiring a web booking raises it again
- [ ] Blocking a dome in admin lowers it (single-night block)
- [ ] Saving pricing re-pushes rates
- [ ] With a wrong refresh token, a web booking retries twice (about 20s and 90s) and sends one admin email

## 3. Inbound bookings (UNVERIFIED: booking fields, `modifiedFrom`, paging)
- [ ] Create a test booking in Beds24; `POST /admin/beds24/pull-bookings` imports it
- [ ] Booking shows in Lufasi with the right dates, guests, price and source (booking.com / expedia)
- [ ] Changing the dates in Beds24 updates the Lufasi booking and re-pushes old and new dates
- [ ] Cancelling in Beds24 cancels it in Lufasi and frees the dates
- [ ] Beds24 status `request` / `inquiry` / `black` are ignored (listed under `ignoredByStatus`)
- [ ] An imported booking with no free dome: logged `OVERBOOKED`, no calendar row, one admin email
- [ ] Cancelling an OTA booking in Lufasi admin returns the 409 message
- [ ] The webhook (`/beds24/webhook?secret=...`) returns 401 with a wrong secret and triggers a pull with the right one
- [ ] Re-pulling the same booking creates no duplicate

## 4. Scheduled jobs
- [ ] Pull every 2 minutes; full push 02:30; drift check 03:30 (UNVERIFIED read-back); retry every 10 minutes
- [ ] Token refresh works after the access token expires (leave it idle past expiry, then book)
- [ ] No 429 errors in normal use (about 100 credits per 5 minutes)

## 5. Cut-over from Channex
- [ ] Switch off Channex (`CHANNEX_ENABLED=false`) before enabling Beds24
- [ ] Disconnect Channex from Booking.com / Expedia and connect Beds24 so only one channel manager feeds each OTA
