/**
 * Background retry for a failed channel-manager push, then an admin email if it
 * still fails. Until a push succeeds the OTAs keep selling the old availability.
 */
const RETRY_DELAYS_MS = [20 * 1000, 90 * 1000];

function retryInBackground(push, { label, firstError, onGiveUp, delays = RETRY_DELAYS_MS }) {
  let attempt = 0;
  let lastError = firstError;

  const next = () => {
    if (attempt >= delays.length) {
      onGiveUp(lastError);
      return;
    }
    const delay = delays[attempt++];
    const timer = setTimeout(async () => {
      try {
        await push();
        console.log(`[${label}] push succeeded on retry ${attempt}`);
      } catch (err) {
        lastError = err.message;
        next();
      }
    }, delay);
    if (timer.unref) timer.unref();
  };

  next();
}

module.exports = { retryInBackground, RETRY_DELAYS_MS };
