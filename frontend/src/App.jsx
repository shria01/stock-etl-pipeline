import { useState } from 'react'
import LoginForm from './LoginForm';

function App() {
  const [token, setToken] = useState('');
  if (!token) {
    return (
      <div>
        <LoginForm onLoginSuccess={receivedToken => setToken(receivedToken)} />
      </div>
    );
  }
  return (
    <div>
      <p> Logged in! Token starts with: {token.slice(0, 20)} </p>
    </div>
  );
}

export default App;