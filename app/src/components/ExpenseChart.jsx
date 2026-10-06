import React from 'react';

const DAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'];

export default function ExpenseChart({ expenses }) {
  const maxExpense = Math.max(...(expenses || []), 1);

  return (
    <div className="chart-container">
      <div className="chart-title">
        <span><svg className="ekko-icon" width="20" height="20" aria-hidden="true"><use href="/assets/icons/ui-icons.svg#chart-increase" /></svg></span>
        Chi tiêu tuần này
      </div>

      <div className="chart">
        {(expenses || []).map((expense, i) => (
          <div
            key={i}
            className={`chart-bar ${expense > maxExpense * 0.75 ? 'high' : ''}`}
            style={{ height: `${(expense / maxExpense) * 100}%` }}
          ></div>
        ))}
      </div>

      <div className="chart-labels">
        {DAYS.map((day, i) => (
          <div key={i} className="chart-label-item">
            {day}
          </div>
        ))}
      </div>
    </div>
  );
}
