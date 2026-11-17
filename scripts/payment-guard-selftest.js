const assert = require("assert");
const { checkAssignable } = require("../src/utils/paymentReceived");
(async () => {
  const none = async () => false, some = async () => true;
  const t = async (b, f, ok, m) => { assert.strictEqual((await checkAssignable(b, f)).ok, ok, m); console.log("ok -", m); };
  for (const s of ["pending","failed","abandoned","cancelled","expired"])
    await t({ id:1, bookingSource:"direct", bookingStatus:s }, some, false, `direct ${s} blocked`);
  await t({ id:1, bookingSource:"direct", bookingStatus:"confirmed" }, none, true, "paystack/squadco/discount confirmed allowed");
  await t({ id:1, bookingSource:"direct", bookingStatus:"paid" }, none, true, "voucher/mock paid allowed");
  await t({ id:1, bookingSource:null, bookingStatus:"pending" }, none, false, "null source pending blocked");
  await t({ id:1, bookingSource:"booking.com", bookingStatus:"confirmed_unassigned" }, none, true, "OTA allowed");
  await t({ id:1, bookingSource:"direct", bookingStatus:"ready_for_checkin" }, some, true, "reallocate with payment");
  await t({ id:1, bookingSource:"direct", bookingStatus:"ready_for_checkin" }, none, false, "reallocate without payment blocked");
})();
