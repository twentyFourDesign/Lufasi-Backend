/**
 * Resolve peak / off-peak nightly rates from pricing config (with legacy fallbacks).
 */

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getNightRatesFromConfig(config, isPeakNight) {
  const legacyBase = num(config?.basePricePerPod ?? config?.base_price_per_pod, 400000);
  const legacyExtra = num(config?.extraGuestFee ?? config?.extra_guest_fee, 100000);

  if (isPeakNight) {
    return {
      basePerPod: num(
        config?.basePricePerPodPeak ?? config?.base_price_per_pod_peak,
        legacyBase,
      ),
      extraGuestFee: num(
        config?.extraGuestFeePeak ?? config?.extra_guest_fee_peak,
        legacyExtra,
      ),
    };
  }

  return {
    basePerPod: num(
      config?.basePricePerPodOffPeak ?? config?.base_price_per_pod_off_peak,
      legacyBase,
    ),
    extraGuestFee: num(
      config?.extraGuestFeeOffPeak ?? config?.extra_guest_fee_off_peak,
      legacyExtra,
    ),
  };
}

function pricingConfigToApi(config) {
  const c = config || {};
  const legacyBase = num(c.basePricePerPod, 400000);
  const legacyExtra = num(c.extraGuestFee, 100000);
  const offPeakBase = num(
    c.basePricePerPodOffPeak ?? c.base_price_per_pod_off_peak,
    legacyBase,
  );
  const peakBase = num(
    c.basePricePerPodPeak ?? c.base_price_per_pod_peak,
    legacyBase,
  );
  const offPeakExtra = num(
    c.extraGuestFeeOffPeak ?? c.extra_guest_fee_off_peak,
    legacyExtra,
  );
  const peakExtra = num(
    c.extraGuestFeePeak ?? c.extra_guest_fee_peak,
    legacyExtra,
  );

  return {
    base_price_per_pod: legacyBase,
    extra_guest_fee: legacyExtra,
    base_price_per_pod_off_peak: offPeakBase,
    base_price_per_pod_peak: peakBase,
    extra_guest_fee_off_peak: offPeakExtra,
    extra_guest_fee_peak: peakExtra,
  };
}

module.exports = {
  getNightRatesFromConfig,
  pricingConfigToApi,
};
