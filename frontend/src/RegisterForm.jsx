import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

function RegisterForm({ onRegisterSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();
      if (!response.ok) {
        const detail = data.detail;
        setError(
          Array.isArray(detail)
            ? detail.map(d => d.msg).join(', ')
            : (detail || 'Something went wrong. Please try again.')
        );
        return;
      }

      const loginResponse = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const loginData = await loginResponse.json();
      if (!loginResponse.ok) {
        setError(loginData.detail || 'Your account was created, but sign-in failed.');
        return;
      }

      onRegisterSuccess(loginData.access_token);

    } catch (err) {
      console.error("Error connecting to FastAPI:", err);
      setError("Could not connect to the server.");
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm rounded-2xl border border-[#DDE7F0] bg-white p-8 shadow-sm"
    >
      <h2 className="mb-6 text-2xl font-semibold tracking-tight text-[#0B1220]">
        Create account
      </h2>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-[#64748B]">
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full rounded-xl border border-[#DDE7F0] px-3 py-2 text-sm text-[#0B1220] focus:border-[#12355B] focus:outline-none focus:ring-2 focus:ring-[#12355B]/20"
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm font-medium text-[#64748B]">
          Password
        </label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          className="w-full rounded-xl border border-[#DDE7F0] px-3 py-2 text-sm text-[#0B1220] focus:border-[#12355B] focus:outline-none focus:ring-2 focus:ring-[#12355B]/20"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-[#FEE2E2] bg-[#FEE2E2]/40 px-3 py-2 text-sm text-[#B91C1C]">
          {error}
        </div>
      )}

      <button
        type="submit"
        className="w-full cursor-pointer rounded-xl bg-[#12355B] py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#082F49]"
      >
        Create account
      </button>
    </form>
  );
}

export default RegisterForm;
