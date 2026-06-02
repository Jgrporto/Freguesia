import { parseJsonResponse, requestLocalApi } from '@/lib/local-api';

export const sendAttendancePresenceHeartbeat = async () => {
  const response = await requestLocalApi('/presence/heartbeat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'attending' }),
  });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel atualizar a presenca.');
  }

  return data;
};

export const fetchActiveAttendanceUsers = async () => {
  const response = await requestLocalApi('/presence/attending-users', { method: 'GET' });
  const data = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel carregar usuarios ativos.');
  }

  return Array.isArray(data) ? data : [];
};
