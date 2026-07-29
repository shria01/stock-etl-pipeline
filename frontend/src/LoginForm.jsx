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
            <input type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)}
                className="border border-gray-400 p-2"
            />
            <input type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border border-gray-400 p-2"
            />
            {error && <p>{error}</p>}
            <button type="submit">Sign in</button>
        </form>
        
    );
}
console.log(import.meta.env.VITE_API_URL)
export default LoginForm;