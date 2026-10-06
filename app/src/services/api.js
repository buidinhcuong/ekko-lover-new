const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4321';

export async function fetchUserProfile() {
  const res = await fetch(`${API_BASE}/api/user/profile`);
  if (!res.ok) throw new Error('Failed to fetch profile');
  return res.json();
}

export async function fetchBudgets() {
  const res = await fetch(`${API_BASE}/api/budgets`);
  if (!res.ok) throw new Error('Failed to fetch budgets');
  return res.json();
}

export async function fetchNews() {
  const res = await fetch(`${API_BASE}/api/news`);
  if (!res.ok) throw new Error('Failed to fetch news');
  return res.json();
}

export async function fetchExpenses(period = 'week') {
  const res = await fetch(`${API_BASE}/api/expenses?period=${period}`);
  if (!res.ok) throw new Error('Failed to fetch expenses');
  return res.json();
}

export async function sendChatMessage(message) {
  const res = await fetch(`${API_BASE}/api/chatbot/message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message })
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function fetchPlans() {
  const res = await fetch(`${API_BASE}/api/plans`);
  if (!res.ok) throw new Error('Failed to fetch plans');
  return res.json();
}
