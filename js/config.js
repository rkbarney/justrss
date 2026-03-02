/**
 * Hardcoded CORS proxy for fetching feeds. Not exposed in UI.
 * Advanced users can edit this file to use their own proxy (e.g. Cloudflare Worker).
 */
window.JUSTRSS_CONFIG = window.JUSTRSS_CONFIG || {
  defaultProxyUrl: 'https://justrss-proxy.rkbarney.workers.dev',
};
