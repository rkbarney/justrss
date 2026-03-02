/**
 * Optional config for your hosted deployment.
 * Set defaultProxyUrl to your Cloudflare Worker URL to make it the default for new users.
 * Leave empty if users will enter their own proxy URL in Settings.
 */
window.JUSTRSS_CONFIG = window.JUSTRSS_CONFIG || {
  defaultProxyUrl: 'https://justrss-proxy.rkbarney.workers.dev',
};
