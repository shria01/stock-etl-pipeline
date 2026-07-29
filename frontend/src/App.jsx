import { useState } from 'react'
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';

function App() {
  const [token, setToken] = useState('');
  const [authView, setAuthView] = useState(null);
  const [userEmail, setUserEmail] = useState('');

  async function fetchUserInfo(newToken) {
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/me`, {
      headers: { 'Authorization': `Bearer ${newToken}` },
    });
    const data = await response.json();
    setUserEmail(data.email);
  }

  return(
    <div className="min-h-screen bg-gray-50">
      <header className="p-4 border-b border-gray-200 flex justify-end gap-3">
        {!token && (
          <>
            <button onClick={() => setAuthView('login')}>Sign in</button>
            <button onClick={() => setAuthView('register')}>Register</button>
          </>
        )}
        {token &&  <p>Hi, {userEmail}</p>}
      </header>
      {authView === 'login' && (
        <div className='flex justify-center p-6'>
          <LoginForm onLoginSuccess={(t) => {setToken(t); fetchUserInfo(t); setAuthView(null)}}/>
        </div>
      )}
      {authView === 'register' && (
        <div className='flex justify-center p-6'>
          <RegisterForm onRegisterSuccess={(t) => {setToken(t); fetchUserInfo(t); setAuthView(null)}}/>
        </div>
      )}
      <main className="p-6">
        <p>Main app content goes here.</p>
      </main>

    </div>
  );
}

export default App;