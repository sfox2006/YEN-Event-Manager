const config = window.YEN_CONFIG || {};

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isConfigured() {
  return /^https:\/\/script\.google\.com\/.+\/exec$/.test(config.API_URL || '');
}

async function request(action, { method = 'GET', data, params = {} } = {}) {
  if (!isConfigured()) throw new ApiError('The Google Apps Script API URL has not been configured. Follow the README deployment steps.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.REQUEST_TIMEOUT_MS || 20000);
  const url = new URL(config.API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const options = { method, signal: controller.signal };
  if (method !== 'GET') {
    options.headers = { 'Content-Type': 'text/plain;charset=utf-8' };
    options.body = JSON.stringify(data || {});
  }
  try {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => { throw new ApiError('The API returned an invalid response.', response.status); });
    if (!response.ok || payload.ok === false) throw new ApiError(payload.error || `Request failed (${response.status}).`, response.status);
    return payload.data;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('The request timed out. Check the API deployment and try again.');
    if (error instanceof ApiError) throw error;
    throw new ApiError(`Could not reach the shared data service: ${error.message}`);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  getBootstrap: () => request('bootstrap'),
  getEvent: eventId => request('event', { params: { event_id: eventId } }),
  saveEvent: event => request('saveEvent', { method: 'POST', data: { event } }),
  saveEventDetail: payload => request('saveEventDetail', { method: 'POST', data: payload }),
  saveCommittee: member => request('saveCommittee', { method: 'POST', data: { member } }),
  saveOrganisation: organisation => request('saveOrganisation', { method: 'POST', data: { organisation } })
};
