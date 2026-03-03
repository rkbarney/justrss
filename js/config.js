/**
 * JustRSS - A minimal, intentional RSS reader
 * Copyright (C) 2025 rkbarney
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Source: https://github.com/rkbarney/justrss
 */

/**
 * Hardcoded CORS proxy for fetching feeds. Not exposed in UI.
 * Advanced users can edit this file to use their own proxy (e.g. Cloudflare Worker).
 */
window.JUSTRSS_CONFIG = window.JUSTRSS_CONFIG || {
  defaultProxyUrl: 'https://justrss-proxy.rkbarney.workers.dev',
};
