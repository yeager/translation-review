import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

export default function Import() {
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [projectName, setProjectName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f && (f.name.endsWith('.po') || f.name.endsWith('.pot'))) {
      setFile(f)
      setError(null)
    } else {
      setError('Please drop a .po or .pot file')
    }
  }, [])

  const handleFileSelect = useCallback((e) => {
    const f = e.target.files[0]
    if (f) {
      setFile(f)
      setError(null)
    }
  }, [])

  const handleUpload = async () => {
    setUploading(true)
    setError(null)
    try {
      const result = await api.importFile(file, projectName || undefined)
      navigate(`/review/${result.queue_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleUrlImport = async () => {
    if (!url.trim()) return
    setUploading(true)
    setError(null)
    try {
      const result = await api.importUrl(url)
      navigate(`/review/${result.queue_id}`)
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Import Translations</h1>

      {/* File drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
          dragging
            ? 'border-blue-500 bg-blue-500/10'
            : file
              ? 'border-emerald-600 bg-emerald-900/10'
              : 'border-gray-700 hover:border-gray-500 bg-gray-900'
        }`}
        onClick={() => document.getElementById('file-input').click()}
      >
        <input
          id="file-input"
          type="file"
          accept=".po,.pot"
          className="hidden"
          onChange={handleFileSelect}
        />
        {file ? (
          <div>
            <div className="text-emerald-400 text-lg font-medium">{file.name}</div>
            <div className="text-gray-500 text-sm mt-1">
              {(file.size / 1024).toFixed(1)} KB — Click or drop to replace
            </div>
          </div>
        ) : (
          <div>
            <div className="text-gray-400 text-lg">
              Drop a .po file here, or click to browse
            </div>
            <div className="text-gray-600 text-sm mt-2">
              Supports GNU gettext PO format
            </div>
          </div>
        )}
      </div>

      {/* Project name */}
      {file && (
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            Project name (optional)
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="e.g. Main Website"
            className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
          />
        </div>
      )}

      {file && (
        <button
          onClick={handleUpload}
          disabled={uploading}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 rounded-lg font-medium transition-colors"
        >
          {uploading ? 'Uploading…' : 'Import & Start Review'}
        </button>
      )}

      {/* URL import */}
      <div className="border-t border-gray-800 pt-8">
        <h2 className="text-lg font-medium text-gray-300 mb-4">
          Or import from URL
        </h2>
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Weblate or Transifex translation URL…"
            className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-4 py-2.5 text-gray-100 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleUrlImport}
            disabled={uploading || !url.trim()}
            className="px-6 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:bg-gray-800 disabled:text-gray-600 rounded-lg font-medium transition-colors border border-gray-700"
          >
            Fetch
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 text-red-300 rounded-lg p-4 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
