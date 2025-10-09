import { useState } from 'react';

function App() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentNode, setCurrentNode] = useState('intro');

  const startSession = async () => {
    const res = await fetch('http://localhost:5001/pairit-local/us-central1/api/sessions/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publicId: 'demo' }),
    });
    const data = await res.json();
    setSessionId(data.sessionId);
    setCurrentNode(data.firstNode);
  };

  const sendEvent = async () => {
    if (!sessionId) return;
    const res = await fetch(`http://localhost:5001/pairit-local/us-central1/api/sessions/${sessionId}/advance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ event: { type: 'next' } }),
    });
    const data = await res.json();
    setCurrentNode(data.newNode);
  };

  return (
    <div style={{ padding: 24 }}>
      <h1>Pairit demo</h1>
      {!sessionId && <button onClick={startSession}>Start session</button>}
      {sessionId && (
        <div>
          <p>Session: {sessionId}</p>
          <p>Current node: {currentNode}</p>
          {currentNode !== 'outro' ? (
            <button onClick={sendEvent}>Next</button>
          ) : (
            <p>Thank you!</p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
