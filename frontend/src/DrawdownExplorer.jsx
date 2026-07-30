import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

function getOrCreateSessionId() {
  let sessionId = localStorage.getItem('session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('session_id', sessionId);
  }
  return sessionId;
}

function DrawdownExplorer({ token }) { 
    const [allTickers, setAllTickers] = useState([]);
    const [ticker, setTicker] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [events, setEvents] = useState([]);
    const [error, setError] = useState(null);

    const [prediction, setPrediction] = useState(null);
    const [predictError, setPredictError] = useState(null);
    const [predictLoading, setPredictLoading] = useState(false);

    useEffect(() => {
        async function loadTickers() {
            const response = await fetch(`${API_URL}/api/tickers`);
            const data = await response.json();
            setAllTickers(data);
        }
        loadTickers();
    }, []);


    function handleTickerChange(value) {
        const upper = value.toUpperCase();
        setTicker(upper);
        if (upper.length === 0) {
            setSuggestions([]);
            return;
        }
        const matches = allTickers.filter(t => t.startsWith(upper));
        setSuggestions(matches.slice(0, 8));
    }
    async function handleSearch(e) {
        e.preventDefault();
        setError(null);
        setSuggestions([]);
        const response = await fetch(`${API_URL}/api/drawdowns?ticker=${ticker}`);

        if (!response.ok) {
            setError('Could not load drawdowns for that ticker.');
            return;
        }
        const data = await response.json();
        setEvents(data);
    }
    async function handlePredict(eventId) {
        setPredictError(null);
        setPredictLoading(true);
        setPrediction(null);
        const headers = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`; 
        }
        const body = { drop_event_id: eventId };
        if (!token) {
            body.session_id = getOrCreateSessionId();
        }
        try {
            const response = await fetch(`${API_URL}/api/predict`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            if (!response.ok) {
                setPredictError('Could not generate a prediction for this event.');
                return;
            }
            const data = await response.json();
            setPrediction(data);

        } finally {
            setPredictLoading(false);
        }

    }
    return (
        <div className="max-w-2xl">
            <form onSubmit={handleSearch} style={{ position: 'relative' }}>
                <input
                type="text"
                value={ticker}
                onChange={(e) => handleTickerChange(e.target.value)}
                placeholder="Ticker, e.g. ABNB"
                className="border border-gray-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-600/30 focus:border-green-600"
                />
                <button type="submit" className="bg-gray-900 text-white rounded-md px-4 py-2 text-sm font-medium ml-2 hover:bg-green-700 transition-colors">
                    Search
                </button>

                {suggestions.length > 0 && (
                <div className="absolute bg-white border border-gray-200 rounded-md mt-1 shadow-lg overflow-hidden z-10">
                    {suggestions.map(s => (
                    <div key={s} onClick={() => { setTicker(s); setSuggestions([]); }} className="px-3 py-2 text-sm font-mono cursor-pointer hover:bg-green-50">
                        {s}
                    </div>
                    ))}
                </div>
                )}
            </form>

            {error && <p>{error}</p>}

            <div>
                {events.map(event => (
                    <div
                        key={event.id}
                        onClick={() => handlePredict(event.id)}
                        className="grid grid-cols-4 gap-3 items-center px-3 py-2.5 rounded-md cursor-pointer hover:bg-green-50 border-b border-gray-100 last:border-0"
                    >
                        <span className="font-mono text-xs text-gray-500">{event.drop_quarter}</span>
                        <span className="text-sm">{event.ticker}</span>
                        <span className="font-mono text-sm font-semibold text-red-700">{(event.drop_pct * 100).toFixed(2)}%</span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium justify-self-end ${
                            event.recovered_within_1yr
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500 italic'
                        }`}>
                            {event.recovered_within_1yr ? `recovered · ${event.days_to_recovery}d` : 'pending'}
                        </span>
                    </div>
                ))}
            </div>
            {predictLoading && <p>Loading prediction...</p>}
            {predictError && <p>{predictError}</p>}
            {prediction && (
            <div className="mt-4 bg-white border border-gray-200 rounded-lg p-5">
                <div className="flex items-baseline justify-between mb-2">
                    <span className="font-mono text-3xl font-bold text-green-700">
                        {(prediction.probability * 100).toFixed(1)}%
                    </span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        prediction.predicted_fast_recovery
                        ? 'bg-green-50 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                        {prediction.predicted_fast_recovery ? 'Likely fast recovery' : 'Not likely fast recovery'}
                    </span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
                    <div
                        className="h-full bg-green-600 rounded-full transition-all duration-700"
                        style={{ width: `${prediction.probability * 100}%` }}
                    />
                </div>
                <p className="text-xs text-gray-500">
                    Threshold: {(prediction.threshold * 100).toFixed(0)}% · Model: {prediction.model_version}
                </p>
            </div>
            )}
        </div>
    );

}
export default DrawdownExplorer;