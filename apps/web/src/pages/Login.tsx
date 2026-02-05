import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { setUser, user } = useAuth()
  const [workspaceCode, setWorkspaceCode] = useState('')
  const [pin, setPin] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) navigate('/app')
  }, [navigate, user])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { user } = await api.login({ workspaceCode, pin, displayName })
      setUser(user)
      navigate('/app')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError('Login failed')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-grid px-6 py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-10 lg:grid lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-3xl border border-clay bg-white/90 p-8 shadow-soft backdrop-blur">
          <div className="mb-6">
            <p className="text-xs uppercase tracking-[0.3em] text-cocoa">Simply Telecom</p>
            <h1 className="mt-3 text-3xl font-semibold text-ink">Text Console</h1>
            <p className="mt-2 text-sm text-cocoa">
              Secure, real-time messaging for your dispatcher workspace.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-cocoa">
                Workspace Code
              </label>
              <input
                value={workspaceCode}
                onChange={(event) => setWorkspaceCode(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-clay bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ember"
                placeholder="simply"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-cocoa">
                Shared PIN
              </label>
              <input
                type="password"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-clay bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ember"
                placeholder="••••••"
                autoComplete="off"
                required
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-cocoa">
                Display Name
              </label>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-clay bg-white px-4 py-3 text-sm text-ink outline-none transition focus:border-ember"
                placeholder="Dispatcher name"
                autoComplete="off"
                required
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold uppercase tracking-wide text-sand transition hover:bg-ember disabled:opacity-70"
            >
              {loading ? 'Signing in...' : 'Enter Console'}
            </button>
          </form>
        </div>

        <div className="flex flex-col justify-between gap-6 rounded-3xl border border-clay bg-gradient-to-br from-white/95 via-white/60 to-sand/70 p-8 shadow-soft">
          <div>
            <h2 className="text-lg font-semibold text-ink">Built for dispatch speed</h2>
            <ul className="mt-4 space-y-3 text-sm text-cocoa">
              <li>Shared workspace login with PIN.</li>
              <li>Live updates and unread tracking.</li>
              <li>Simple contact speed dial for drivers.</li>
              <li>Searchable, persistent conversation history.</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-clay bg-white/80 p-4 text-xs text-cocoa">
            Tip: Add your key drivers first, then start messaging directly from the contact list.
          </div>
        </div>
      </div>
    </div>
  )
}
