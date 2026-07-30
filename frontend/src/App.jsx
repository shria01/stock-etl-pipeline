import { useState } from 'react'
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import DrawdownExplorer from './DrawdownExplorer';

function App() {
  const [token, setToken] = useState('');
  const [authView, setAuthView] = useState(null);
  const [userEmail, setUserEmail] = useState('');
  const [currentPage, setCurrentPage] = useState('dashboard');

  async function fetchUserInfo(newToken) {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${newToken}` },
    });
    const data = await response.json();
    setUserEmail(data.email);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="px-6 py-3 border-b border-gray-200 bg-white flex justify-between items-center">
        <div className="flex items-center gap-8">
          <div className="font-serif font-medium text-lg flex items-baseline gap-1.5">
            <span className="text-green-700 text-xl leading-none">●</span>Recovery
          </div>

          <nav className="flex gap-6 text-sm font-medium">
            {[
              { id: 'dashboard', label: 'Dashboard' },
              { id: 'browse', label: 'Browse' },
              { id: 'history', label: 'History' },
              { id: 'analysis', label: 'Analysis' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setCurrentPage(id)}
                className={`pb-3 -mb-3 border-b-2 transition-colors ${
                  currentPage === id
                    ? 'border-green-700 text-green-700'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!token && (
            <>
              <button
                onClick={() => setAuthView('login')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                Sign in
              </button>
              <button
                onClick={() => setAuthView('register')}
                className="text-sm font-medium bg-gray-900 text-white px-3.5 py-1.5 rounded-md hover:bg-green-700 transition-colors"
              >
                Register
              </button>
            </>
          )}
          {token && (
            <p className="text-sm text-gray-700">
              Hi, <span className="font-medium">{userEmail}</span>
            </p>
          )}
        </div>
      </header>

      {(authView === 'login' || authView === 'register') && (
        <div
          className="fixed inset-0 bg-black/20 flex items-center justify-center p-6 z-50"
          onClick={() => setAuthView(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="relative w-full max-w-sm">
            <button
              onClick={() => setAuthView(null)}
              className="absolute -top-3 -right-3 bg-white border border-gray-200 rounded-full w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 shadow-sm"
            >
              ✕
            </button>
            {authView === 'login' && (
              <LoginForm onLoginSuccess={(t) => { setToken(t); fetchUserInfo(t); setAuthView(null); }} />
            )}
            {authView === 'register' && (
              <RegisterForm onRegisterSuccess={(t) => { setToken(t); fetchUserInfo(t); setAuthView(null); }} />
            )}
          </div>
        </div>
      )}

      <main className="p-6">
        {currentPage === 'browse' && <DrawdownExplorer token={token} />}
        {currentPage === 'dashboard' && <p>Dashboard coming soon.</p>}
        {currentPage === 'history' && <p>History coming soon.</p>}
        {currentPage === 'analysis' && <p>Analysis coming soon.</p>}
      </main>
    </div>
  );
}

export default App;