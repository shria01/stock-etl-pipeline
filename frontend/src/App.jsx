import { useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import DrawdownExplorer from './DrawdownExplorer';
import Dashboard from './Dashboard';
import PredictionHistory from './PredictionHistory';
import { Activity, X } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Overview', requiresAuth: false },
  { id: 'browse', label: 'Predict', requiresAuth: false },
  { id: 'history', label: 'History', requiresAuth: true },
  { id: 'analysis', label: 'Model Analysis', requiresAuth: false },
];

const badgeAI =
  'rounded-full bg-[#E8F1F8] px-2.5 py-1 text-xs font-semibold text-[#12355B]';

function App() {
  const [token, setToken] = useState('');
  const [authView, setAuthView] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [initialEventId, setInitialEventId] = useState(null);

  function handleGoToPredict(eventId = null) {
    setInitialEventId(eventId);
    setCurrentPage('browse');
  }

  async function fetchUserInfo(newToken) {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    const data = await response.json();
    setUserEmail(data.email);
  }

  async function claimPredictions(newToken) {
    const sessionId = localStorage.getItem('session_id');
    if (!sessionId) return;

    await fetch(`${import.meta.env.VITE_API_URL}/api/predictions/claim?session_id=${sessionId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${newToken}` },
    });
  }

  async function handleAuthSuccess(newToken) {
    // Claim guest predictions before mounting the signed-in dashboard; otherwise
    // its first history request can race the claim and incorrectly show zeroes.
    await Promise.allSettled([
      claimPredictions(newToken),
      fetchUserInfo(newToken),
    ]);
    setToken(newToken);
    setAuthView(null);
  }

  const currentLabel = NAV_ITEMS.find(item => item.id === currentPage)?.label;

  return (
    <div className="flex min-h-screen bg-[#F5F8FB] text-[#0B1220]">
      {/* SIDEBAR */}
      <aside className="flex w-60 flex-shrink-0 flex-col border-r border-[#DDE7F0] bg-white px-5 py-6">
        <div className="mb-8 px-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#E8F1F8] text-[#12355B]">
              <Activity className="h-4 w-4" />
            </div>

            <div>
              <div className="text-base font-bold tracking-tight text-[#0B1220]">
                DrawdownIQ
              </div>
              <p className="text-xs text-[#64748B]">
                Recovery analytics
              </p>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.filter(item => !item.requiresAuth || token).map(item => (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'browse') {
                  setInitialEventId(null);
                }
                setCurrentPage(item.id);
              }}
              className={`cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                currentPage === item.id
                  ? 'bg-[#F1F6FA] text-[#12355B]'
                  : 'text-[#64748B] hover:bg-[#F8FBFF] hover:text-[#0B1220]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="mt-4 border-t border-[#DDE7F0] pt-4">
          {!token && (
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setAuthView('login')}
                className="cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#64748B] transition-colors hover:bg-[#F8FBFF] hover:text-[#0B1220]"
              >
                Sign in
              </button>
              <button
                onClick={() => setAuthView('register')}
                className="cursor-pointer rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#0B1220] transition-colors hover:bg-[#E8F1F8]"
              >
                Register
              </button>
            </div>
          )}

          {token && (
            <div className="rounded-2xl bg-[#F8FBFF] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#94A3B8]">
                Signed in
              </p>
              <p className="mt-1 truncate text-sm font-medium text-[#0B1220]">
                {userEmail}
              </p>
            </div>
          )}
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[#DDE7F0] bg-white/80 px-8 py-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[#0B1220]">
              {currentLabel}
            </h1>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-7">
          {currentPage === 'browse' && (
            <DrawdownExplorer
              token={token}
              onSignIn={() => setAuthView('login')}
              initialEventId={initialEventId}
              clearInitialEvent={() => setInitialEventId(null)}
            />
          )}

          {currentPage === 'dashboard' && (
            <Dashboard
              token={token}
              onSignIn={() => setAuthView('login')}
              onRegister={() => setAuthView('register')}
              onGoToPredict={handleGoToPredict}
            />
          )}

          {currentPage === 'history' && <PredictionHistory token={token} />}

          {currentPage === 'analysis' && (
            <div className="rounded-2xl border border-[#DDE7F0] bg-white p-6 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
              <div className={`mb-2 inline-flex items-center gap-2 ${badgeAI}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-[#2A6F97]" />
                Model analysis
              </div>
              <h2 className="text-base font-semibold tracking-tight text-[#0B1220]">
                Analysis coming soon
              </h2>
              <p className="mt-2 text-sm text-[#64748B]">
                This page will show model findings, recovery cohorts, and feature-level analysis.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* AUTH MODAL */}
      {(authView === 'login' || authView === 'register') && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1220]/30 p-6 backdrop-blur-sm"
          onClick={() => setAuthView(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-sm"
          >
            <button
              onClick={() => setAuthView(null)}
              className="absolute -right-3 -top-3 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-[#DDE7F0] bg-white text-[#64748B] shadow-sm transition-colors hover:text-[#0B1220]"
              aria-label="Close auth modal"
            >
              <X className="h-4 w-4" />
            </button>

            {authView === 'login' && (
              <LoginForm
                onLoginSuccess={handleAuthSuccess}
              />
            )}

            {authView === 'register' && (
              <RegisterForm
                onRegisterSuccess={handleAuthSuccess}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
