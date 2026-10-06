import React, { useState, useEffect } from 'react';
import ProfileSection from '../components/ProfileSection';
import BudgetSection from '../components/BudgetSection';
import PlanSection from '../components/PlanSection';
import NewsCarousel from '../components/NewsCarousel';
import ExpenseChart from '../components/ExpenseChart';
import ChatbotSection from '../components/ChatbotSection';
import '../styles/HomeScreen.css';

export default function HomeScreen() {
  const [userProfile, setUserProfile] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [plans, setPlans] = useState([]);
  const [news, setNews] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // Fetch user profile
      const profileRes = await fetch('/api/user/profile');
      const profile = await profileRes.json();
      setUserProfile(profile);

      // Fetch budgets
      const budgetsRes = await fetch('/api/budgets');
      const budgetsData = await budgetsRes.json();
      setBudgets(budgetsData);

      // Fetch plans
      const plansRes = await fetch('/api/plans');
      const plansData = await plansRes.json();
      setPlans(plansData.plans || []);

      // Fetch news
      const newsRes = await fetch('/api/news');
      const newsData = await newsRes.json();
      setNews(newsData);

      // Fetch expenses for chart
      const expensesRes = await fetch('/api/expenses?period=week');
      const expensesData = await expensesRes.json();
      setExpenses(expensesData);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="homescreen-loading">Loading...</div>;
  }

  return (
    <div className="homescreen">
      <ProfileSection userProfile={userProfile} />
      <BudgetSection budgets={budgets} />
      <PlanSection plans={plans} />
      <NewsCarousel news={news} />
      <ExpenseChart expenses={expenses} />
      <ChatbotSection />
    </div>
  );
}
