import { useEffect, useState } from 'react';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import DrawdownExplorer from './DrawdownExplorer';
import Dashboard from './Dashboard';
import PredictionHistory from './PredictionHistory';
import ModelAnalysis from './ModelAnalysis';
import { Activity, ChartNoAxesCombined, History, LayoutDashboard, LogOut, Search, X } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard, requiresAuth: false },
  { id: 'browse', label: 'Predict', icon: Search, requiresAuth: false },
  { id: 'history', label: 'History', icon: History, requiresAuth: true },
  { id: 'analysis', label: 'Model Analysis', icon: ChartNoAxesCombined, requiresAuth: false },
];

const PAGE_QUERY_VALUES = {
  dashboard: null,
  browse: 'predict',
  history: 'history',
  analysis: 'model-analysis',
};

function readNavigationFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const pageValue = params.get('page');
  const currentPage = Object.entries(PAGE_QUERY_VALUES).find(([, value]) => value === pageValue)?.[0] || 'dashboard';
  const eventValue = Number(params.get('event'));

  return {
    currentPage,
    initialEventId: currentPage === 'browse' && Number.isFinite(eventValue) && eventValue > 0
      ? eventValue
      : null,
  };
}

function App() {
  const initialNavigation = readNavigationFromUrl();
  const [token, setToken] = useState('');
  const [authView, setAuthView] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [currentPage, setCurrentPage] = useState(initialNavigation.currentPage);
  const [initialEventId, setInitialEventId] = useState(initialNavigation.initialEventId);

  useEffect(() => {
    localStorage.removeItem('session_id');
  }, []);

  useEffect(() => {
    function handlePopState() {
      const navigation = readNavigationFromUrl();
      setCurrentPage(navigation.currentPage);
      setInitialEventId(navigation.initialEventId);
      setAuthView(null);
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigateTo(page, eventId = null, { replace = false } = {}) {
    const url = new URL(window.location.href);
    const pageValue = PAGE_QUERY_VALUES[page];

    if (pageValue) {
      url.searchParams.set('page', pageValue);
    } else {
      url.searchParams.delete('page');
    }

    if (page === 'browse' && eventId) {
      url.searchParams.set('event', String(eventId));
    } else {
      url.searchParams.delete('event');
    }

    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextUrl);
    }

    setCurrentPage(page);
    setInitialEventId(page === 'browse' ? eventId : null);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  function handleGoToPredict(eventId = null) {
    navigateTo('browse', eventId);
  }

  async function fetchUserInfo(newToken) {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    const data = await response.json();
    setUserEmail(data.email);
  }

  async function handleAuthSuccess(newToken) {
    await fetchUserInfo(newToken);
    setToken(newToken);
    setAuthView(null);
  }

  function handleSignOut() {
    setToken('');
    setUserEmail('');
    if (currentPage === 'history') navigateTo('dashboard', null, { replace: true });
  }

  return (
    <div className="flex min-h-screen bg-[#F5F8FB] text-[#0B1220]">
      {/* SIDEBAR */}
      <aside className="sticky top-0 flex h-screen w-[272px] flex-shrink-0 p-5">
        <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white p-3 shadow-[0_12px_30px_rgba(15,35,60,0.10)] ring-1 ring-[#E8EEF4]">
          <div className="flex items-center gap-3 px-1 pb-4 pt-1">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#12355B] text-white">
              <Activity className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-base font-bold tracking-tight text-[#0B1220]">
                DrawdownIQ
              </div>
              <p className="text-xs text-[#64748B]">
                Recovery analytics
              </p>
            </div>
          </div>
          <nav className="flex flex-col gap-1 border-t border-[#E8EEF4] pt-3">
            {NAV_ITEMS.filter(item => !item.requiresAuth || token).map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    navigateTo(item.id);
                  }}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-all ${
                    currentPage === item.id
                      ? 'bg-[#12355B] text-white shadow-sm'
                      : 'text-[#64748B] hover:bg-[#F4F8FC] hover:text-[#0B1220]'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-[#E8EEF4] pt-3">
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
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-3 flex w-full cursor-pointer items-center gap-2 rounded-xl border border-[#DDE7F0] bg-white px-3 py-2 text-left text-sm font-semibold text-[#52637A] transition-colors hover:border-[#BFD0DF] hover:text-[#0B1220]"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.8} />
                Sign out
              </button>
            </div>
          )}
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className={`mx-auto w-full flex-1 px-8 py-7 ${currentPage === 'analysis' ? 'max-w-[1360px]' : 'max-w-5xl'}`}>
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
              onGoToHistory={() => navigateTo('history')}
              onGoToModelAnalysis={() => navigateTo('analysis')}
            />
          )}

          {currentPage === 'history' && <PredictionHistory token={token} />}

          {currentPage === 'analysis' && (
            <ModelAnalysis />
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
