/**
 * One-time Beds24 setup: swap an invite code for a refresh token.
 *
 *   1. In Beds24: Settings > Marketplace > API > Invite codes > generate a code
 *      with these scopes: bookings (read), inventory (read and write), properties (read).
 *   2. Run:  node scripts/beds24-setup.js <INVITE_CODE>
 *   3. Put the printed refresh token in BEDS24_REFRESH_TOKEN, then run
 *      node scripts/beds24-setup.js --list  to find BEDS24_PROPERTY_ID and BEDS24_ROOM_ID.
 *
 * The invite code works once, so keep the refresh token safe. It is a password.
 * The endpoint shapes are UNVERIFIED until run against a real account.
 */
require("dotenv").config();
const beds24Service = require("../src/services/beds24Service");

async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.error("Usage: node scripts/beds24-setup.js <INVITE_CODE> | --list");
    process.exit(1);
  }

  if (arg === "--list") {
    const props = await beds24Service.request("GET", "/properties", {
      params: { includeAllRooms: true },
    });
    const rows = Array.isArray(props) ? props : props?.data || [];
    for (const p of rows) {
      console.log(`Property ${p.id}: ${p.name}`);
      for (const r of p.roomTypes || p.rooms || []) {
        console.log(`   Room ${r.id}: ${r.name} (units: ${r.qty ?? r.quantity ?? "?"})`);
      }
    }
    return;
  }

  const res = await beds24Service.exchangeInviteCode(arg);
  console.log("Response from Beds24:");
  console.log(JSON.stringify({ ...res, token: res.token ? "(hidden)" : undefined }, null, 2));
  if (res.refreshToken) {
    console.log("\nAdd this to your environment:\n");
    console.log(`BEDS24_REFRESH_TOKEN=${res.refreshToken}`);
  } else {
    console.log("\nNo refreshToken in the response. Check the invite code has not been used.");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
