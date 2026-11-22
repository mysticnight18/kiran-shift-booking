export function createShiftApi(baseUrl) {
  async function request(path, method = 'GET') {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, {
        method,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.message || `The server returned HTTP ${response.status}.`);
      }
      if (!data) throw new Error('The server returned an invalid response.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error('The shift server took too long to respond.');
      if (error instanceof TypeError) throw new Error('Could not connect to the shift server.');
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    list: () => request('/shifts'),
    update: (id, action) => request(`/shifts/${encodeURIComponent(id)}/${action}`, 'POST'),
  };
}
