/**
 * Optional config for your hosted deployment.
 * Set defaultProxyUrl to your Cloudflare Worker URL to make it the default for new users.
 * Leave empty for the open-source default (AllOrigins).
 */
window.JUSTRSS_CONFIG = window.JUSTRSS_CONFIG || {
  defaultProxyUrl: 'https://justrss-proxy.rkbarney.workers.dev',
};
