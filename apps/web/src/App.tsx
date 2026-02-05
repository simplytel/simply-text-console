import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import LoginPage from './pages/Login'
import InboxPage from './pages/Inbox'

function FullScreenNotice({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen bg-grid p-6">
      <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
        <div className="rounded-3xl border border-clay bg-white/80 px-8 py-10 shadow-soft backdrop-blur">
          <h1 className="text-2xl font-semibold text-ink">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-cocoa">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <FullScreenNotice title="Loading workspace" subtitle="One moment..." />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}

function RootRedirect() {
  const { user, loading } = useAuth()
  if (loading) {
    return <FullScreenNotice title="Loading workspace" subtitle="One moment..." />
  }
  return <Navigate to={user ? '/app' : '/login'} replace />
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/app"
          element={
            <RequireAuth>
              <InboxPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}
