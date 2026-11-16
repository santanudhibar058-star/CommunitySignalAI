import { useState, useEffect } from 'react';
import JarvisCore from "./JarvisCore.jsx";
import { apiUrl } from "../api.js";

// Legacy chat import retained for compatibility; it uses the shared PeopleCare guide.
export default function MayaChat() {
  const [messages, setMessages] = useState(() => {
    // Load persisted chat from localStorage
    try {
      const stored = localStorage.getItem('mayaChat');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Persist chat on change
  useEffect(() => {
    try {
      localStorage.setItem('mayaChat', JSON.stringify(messages));
    } catch {
      // Browser storage can be unavailable; the current chat remains in memory.
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user', content: input.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(apiUrl('/api/maya/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content, history: messages }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const reply = data.reply || data.error || 'No response';
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
    } catch (e) {
      console.error(e);
      setError('Failed to get response from PeopleCare AI');
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ ' + e.message }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="maya-chat">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}><JarvisCore state={loading ? "thinking" : "idle"} size={46} compact /> PeopleCare AI Assistant</h2>
      <div className="chat-window" style={{ maxHeight: '400px', overflowY: 'auto', border: '1px solid #444', padding: '0.5rem', borderRadius: '4px' }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: '0.5rem' }}>
            <strong>{msg.role === 'user' ? 'You' : 'PeopleCare AI'}:</strong> {msg.content}
          </div>
        ))}
        {loading && <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><JarvisCore state="thinking" size={38} compact /> PeopleCare AI is processing…</div>}
      </div>
      {error && <div className="error" style={{ color: 'red' }}>{error}</div>}
      <textarea
        rows={2}
        placeholder="Ask PeopleCare AI…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKey}
        disabled={loading}
        style={{ width: '100%', marginTop: '0.5rem' }}
      />
      <button onClick={sendMessage} disabled={loading || !input.trim()} className="primary-btn" style={{ marginTop: '0.5rem' }}>
        Send
      </button>
    </div>
  );
}

