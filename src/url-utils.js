const TRACKING_PARAMS = [
  /^utm_/i,
  /^spm$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^yclid$/i,
  /^msclkid$/i,
  /^ref$/i,
  /^referrer$/i,
  /^referrer_s$/i,
  /^source$/i,
  /^ad_source$/i,
  /^from$/i,
  /^ch$/i
];

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    url.hash = '';
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');

    for (const key of [...url.searchParams.keys()]) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) {
        url.searchParams.delete(key);
      }
    }

    url.searchParams.sort();
    let normalized = url.toString();
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return String(value || '').trim();
  }
}

module.exports = {
  normalizeUrl
};
