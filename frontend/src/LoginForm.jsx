import { useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL; 
function LoginForm({onLoginSuccess}){
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    async function handleSubmit(e){
        e.preventDefault();
        try {
            const response = await fetch(`${API_URL}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await response.json();
            if (!response.ok) {
                setError(data.detail);
                return;
            }
            onLoginSuccess(data.access_token);

        } catch(err) {
            console.error("Error connecting to FastAPI:", err);
            setError("Could not connect to the server.");
        }

    }
    return (
        <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white border border-gray-200 rounded-xl shadow-sm p-8">
            <h2 className="text-2xl font-semibold mb-6">Sign in</h2>
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
                <input type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600/30 focus:border-green-600"
                />
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-600 mb-1">Password</label>
                <input type="password" 
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-600/30 focus:border-green-600"
                />
            </div>

            {error && (
                <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    {error}
                </div>
            )}
            
            <button type="submit" className="w-full bg-gray-900 text-white rounded-md py-2.5 text-sm font-medium hover:bg-green-700 transition-colors">
                Sign in
            </button>
        </form>
        
    );
}

export default LoginForm;