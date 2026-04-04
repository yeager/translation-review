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

async function requestRaw(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options)
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res
}

export const api = {
  // Dashboard
  getDashboardOverview: () => request('/dashboard/overview'),
  getDirtyFiles: () => request('/dashboard/dirty'),
  getActivity: () => request('/dashboard/activity'),

  // Search
  searchStrings: (q) => request(`/search?q=${encodeURIComponent(q)}`),

  // Strings
  getString: (id) => request(`/strings/${id}`),
  getStringDetail: (id) => request(`/strings/${id}/detail`),
  approveString: (id) => request(`/strings/${id}/approve`, { method: 'POST' }),
  rejectString: (id) => request(`/strings/${id}/reject`, { method: 'POST' }),

  // Projects
  getProjects: (params = {}) => {
    const sp = new URLSearchParams()
    if (params.search) sp.set('search', params.search)
    if (params.has_strings) sp.set('has_strings', 'true')
    if (params.offset != null) sp.set('offset', params.offset)
    if (params.limit != null) sp.set('limit', params.limit)
    return request(`/projects?${sp}`)
  },
  getProject: (id) => request(`/projects/${id}`),

  // Files
  getFiles: (params = {}) => {
    const sp = new URLSearchParams()
    if (params.project) sp.set('project', params.project)
    if (params.offset != null) sp.set('offset', params.offset)
    if (params.limit != null) sp.set('limit', params.limit)
    return request(`/files?${sp}`)
  },
  getFileStrings: (fileId, params = {}) => {
    const sp = new URLSearchParams()
    if (params.offset != null) sp.set('offset', params.offset)
    if (params.limit != null) sp.set('limit', params.limit)
    if (params.quality_max != null) sp.set('quality_max', params.quality_max)
    if (params.search) sp.set('search', params.search)
    return request(`/files/${fileId}/strings?${sp}`)
  },

  // Translations
  updateTranslation: (id, msgstr) =>
    request(`/translations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ msgstr }),
    }),

  // Review
  getReviewBatch: (params = {}) => {
    const sp = new URLSearchParams()
    if (params.offset != null) sp.set('offset', params.offset)
    if (params.limit != null) sp.set('limit', params.limit)
    if (params.min_quality != null) sp.set('min_quality', params.min_quality)
    if (params.max_quality != null) sp.set('max_quality', params.max_quality)
    if (params.file_id != null) sp.set('file_id', params.file_id)
    return request(`/review/batch?${sp}`)
  },
  submitReview: (reviewer, decisions) =>
    request('/review/submit', {
      method: 'POST',
      body: JSON.stringify({ reviewer, decisions }),
    }),
  getReviewStats: () => request('/review/stats'),
  getReviewFile: (fileId, params = {}) => {
    const sp = new URLSearchParams()
    if (params.offset != null) sp.set('offset', params.offset)
    if (params.limit != null) sp.set('limit', params.limit)
    return request(`/review/file/${fileId}?${sp}`)
  },
  reviewDecide: (translationId, body) =>
    request(`/review/decide/${translationId}`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  // Pipeline
  getPipelineStatus: () => request('/pipeline/status'),
  runPipeline: (fileId, stages) =>
    request(`/pipeline/run/${fileId}?stages=${stages || 'quality,auto_approve,queue'}`, { method: 'POST' }),

  // Changes
  getChanges: (params = {}) => {
    const sp = new URLSearchParams()
    if (params.offset != null) sp.set('offset', params.offset)
    if (params.limit != null) sp.set('limit', params.limit)
    return request(`/changes?${sp}`)
  },
  getFileChanges: (fileId, limit = 100) => request(`/changes/${fileId}?limit=${limit}`),

  // Upstream
  pollUpstream: (fileId) => request(`/upstream/poll/${fileId}`, { method: 'POST' }),
  setUpstreamUrl: (fileId, url) =>
    request(`/files/${fileId}/upstream`, {
      method: 'PUT',
      body: JSON.stringify({ upstream_url: url }),
    }),

  // AI
  getAIQueue: () => request('/ai/queue'),
  getAIStats: () => request('/ai/stats'),

  // Queue
  getQueue: () => request('/queue'),

  // Export
  exportPO: (fileId) => requestRaw(`/export/po/${fileId}`),

  // TM
  searchTM: (q) => request(`/tm/search?q=${encodeURIComponent(q)}`),

  // Terminology
  getTerminology: () => request('/terminology'),

  // Import
  importPO: async (file) => {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/import/po`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) throw new Error(`Import failed: ${res.status}`)
    return res.json()
  },
}
