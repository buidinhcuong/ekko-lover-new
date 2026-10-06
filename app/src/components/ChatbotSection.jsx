import React, { useState } from 'react';

export default function ChatbotSection() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/chatbot/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input })
      });
      const data = await response.json();
      console.log('Bot response:', data);
      setInput('');
      // Update chat history here
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chatbot-section">
      <img
        src="/assets/mascot/bot-1.png"
        alt="Octopus Bot"
        className="chatbot-mascot"
      />

      <div className="chatbot-input-wrapper">
        <input
          type="text"
          className="chatbot-input"
          placeholder="Ghi nhanh..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          disabled={loading}
        />
        <button className="chatbot-send" onClick={handleSend} disabled={loading}>
          <img
            src="/assets/mascot/bot-1.png"
            alt="Send"
            style={{ width: '28px', height: '28px', objectFit: 'contain' }}
          />
        </button>
      </div>
    </div>
  );
}
