const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export const api = {
  // Projects
  getProjects: () => request('/projects'),
  getProject: (id) => request(`/projects/${id}`),

  // Review queues
  getQueues: () => request('/queues'),
  getQueue: (id) => request(`/queues/${id}`),
  getQueueStrings: (queueId) => request(`/queues/${queueId}/strings`),

  // String actions
  getString: (id) => request(`/strings/${id}`),
  approveString: (id) => request(`/strings/${id}/approve`, { method: 'POST' }),
  rejectString: (id) => request(`/strings/${id}/reject`, { method: 'POST' }),
  editString: (id, translation) =>
    request(`/strings/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ translation }),
    }),

  // Import
  importFile: async (file, projectName) => {
    const formData = new FormData()
    formData.append('file', file)
    if (projectName) formData.append('project_name', projectName)
    const res = await fetch(`${BASE}/import`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) throw new Error(`Import failed: ${res.status}`)
    return res.json()
  },

  importUrl: (url) =>
    request('/import/url', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  // Dashboard
  getDashboardOverview: () => request('/dashboard/overview'),
  getDirtyFiles: () => request('/dashboard/dirty'),
  getActivity: () => request('/dashboard/activity'),

  // Search
  searchStrings: (query) => request(`/search?q=${encodeURIComponent(query)}`),
  getStringDetail: (id) => request(`/strings/${id}/detail`),

  // AI Queue
  getAIQueue: () => request('/ai/queue'),
  getAIStats: () => request('/ai/stats'),

  // Dirty files
  getDirtyFilesList: () => request('/dashboard/dirty'),
}
