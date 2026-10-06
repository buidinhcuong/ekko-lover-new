import React from 'react';

export default function BudgetSection({ budgets }) {
  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">
          <span className="section-icon"><svg className="ekko-icon" width="20" height="20" aria-hidden="true"><use href="/assets/icons/ui-icons.svg#credit-card" /></svg></span>
          Ngân sách
        </div>
        <button className="view-all-btn">Xem tất cả →</button>
      </div>

      <div className="budget-items">
        {budgets.map((budget) => (
          <div key={budget.id} className="budget-item">
            <div className="budget-name">
              <span>{budget.icon}</span>
              {budget.name}
            </div>
            <div className="budget-progress">
              <div className="progress-bar">
                <div
                  className={`progress-fill ${budget.spent > budget.limit * 0.75 ? 'high' : ''}`}
                  style={{ width: `${(budget.spent / budget.limit) * 100}%` }}
                ></div>
              </div>
              <span>{budget.spent.toLocaleString()}k / {budget.limit.toLocaleString()}k</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
