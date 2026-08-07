import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

function PredictionHistory({ token }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedId, setExpandedId] = useState(null);
    useEffect(() => {
        async function loadHistory() {
            if (!token) {
                setLoading(false);
                return;
            }
            try {
                const historyRes = await fetch(`${API_URL}/api/predictions/me`, { headers: { 'Authorization': `Bearer ${token}` } });
                if (!historyRes.ok) throw new Error(`History request failed: ${historyRes.status}`);
                const rawHistory = await historyRes.json();
                if (!Array.isArray(rawHistory)) throw new Error('History response was not a list');
                setHistory(rawHistory);
            } catch (err) {
                console.error('Unable to load prediction history', err);
                setError('Could not load prediction history. Please try again.');
            } finally {
                setLoading(false);
            }

        }
        loadHistory();
    }, [token]);

    function toggleExpand(id) {
        setExpandedId(prev => prev === id ? null : id);
    }
    if (loading) return <p className="text-gray-500">Loading predictions...</p>;
    if (!token) return <p className="text-gray-500">Sign in to see your prediction history.</p>;
    if (error) return <p className="text-red-700">{error}</p>;
    if (history.length === 0) return <p className="text-gray-500">No predictions yet — try Predict.</p>;
    return (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-3xl">
            {history.map(pred => {
                const isExpanded = expandedId === pred.id;
                const actualOutcome = pred.recovered_within_1yr ?? null;
                const isMatch = actualOutcome !== null
                    ? actualOutcome === (pred.predicted_probability >= 0.5)
                    : null;

                return (
                    <div key={pred.id} className="border-b border-gray-100 last:border-0">
                        <div
                            onClick={() => toggleExpand(pred.id)}
                            className="px-5 py-3.5 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                        >
                            <div>
                                <span className="font-mono font-semibold text-sm mr-3">{pred.ticker ?? 'Unknown'}</span>
                                <span className="text-xs text-gray-500">{pred.sector}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-sm">{(pred.predicted_probability * 100).toFixed(1)}%</span>
                                {isMatch !== null && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isMatch ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                        }`}>
                                        {isMatch ? 'Match' : 'Miss'}
                                    </span>
                                )}
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="px-5 pb-4 pt-1 bg-gray-50 grid grid-cols-4 gap-3 text-sm">
                                <div>
                                    <div className="text-xs text-gray-500">Drop quarter</div>
                                    <div className="font-mono">{pred.drop_quarter ?? 'Unknown'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Event max drawdown</div>
                                    <div className="font-mono text-red-700">
                                        {pred.drop_pct == null ? 'Unknown' : `${(pred.drop_pct * 100).toFixed(2)}%`}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Model called</div>
                                    <div className="font-mono">{pred.predicted_probability >= 0.5 ? 'Yes' : 'No'}</div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500">Actual outcome</div>
                                    <div className="font-mono">
                                        {pred.days_to_recovery != null
                                            ? `Recovered · ${pred.days_to_recovery}d`
                                            : 'Pending'}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default PredictionHistory;
