export async function api(url, options = {}) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 207) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return { ...payload, status: response.status };
}

export const postJson = (url, body = {}) => api(url, { method: 'POST', body: JSON.stringify(body) });
export const putJson = (url, body = {}) => api(url, { method: 'PUT', body: JSON.stringify(body) });
export const deleteJson = (url, body) => api(url, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });

export function localDayRange([fromDate, toDate] = []) {
  const range = {};
  if (fromDate) {
    const start = new Date(fromDate);
    start.setHours(0, 0, 0, 0);
    range.from = start.toISOString();
  }
  if (toDate) {
    const end = new Date(toDate);
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 1);
    range.to = end.toISOString();
  }
  return range;
}
