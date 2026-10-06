import React, { useState } from 'react';

export default function PlanSection({ plans }) {
  const [expandedPlan, setExpandedPlan] = useState(null);

  if (!plans || plans.length === 0) {
    return (
      <div className="section">
        <div className="section-header">
          <div className="section-title">
            <span className="section-icon"><svg className="ekko-icon" width="20" height="20" aria-hidden="true"><use href="/assets/icons/ui-icons.svg#task-01" /></svg></span>
            Kế hoạch
          </div>
          <button className="view-all-btn">Tạo mới →</button>
        </div>
        <div className="empty-state">
          <p>Chưa có kế hoạch nào. Hãy tạo kế hoạch đầu tiên!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">
          <span className="section-icon"><svg className="ekko-icon" width="20" height="20" aria-hidden="true"><use href="/assets/icons/ui-icons.svg#task-01" /></svg></span>
          Kế hoạch
        </div>
        <button className="view-all-btn">Xem tất cả →</button>
      </div>

      <div className="plan-items">
        {plans.map((plan) => (
          <div key={plan.id} className="plan-card">
            <div className="plan-header">
              <div className="plan-title-section">
                <span className="plan-icon">{plan.icon}</span>
                <div>
                  <h3>{plan.name}</h3>
                  <span className="plan-meta">{plan.completed_tasks}/{plan.total_tasks} hoàn thành</span>
                </div>
              </div>
              <button
                className="expand-btn"
                onClick={() => setExpandedPlan(expandedPlan === plan.id ? null : plan.id)}
              >
                {expandedPlan === plan.id ? '−' : '+'}
              </button>
            </div>

            <div className="plan-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${plan.percent}%` }}
                ></div>
              </div>
              <span className="progress-percent">{plan.percent}%</span>
            </div>

            {expandedPlan === plan.id && (
              <div className="plan-tasks">
                {plan.tasks && plan.tasks.map((task) => (
                  <div key={task.id} className="task-item">
                    <input
                      type="checkbox"
                      checked={task.status === 'completed'}
                      onChange={() => {}}
                      className="task-checkbox"
                    />
                    <span className={`task-title ${task.status === 'completed' ? 'completed' : ''}`}>
                      {task.title}
                    </span>
                  </div>
                ))}
                <button className="add-task-btn">+ Thêm nhiệm vụ</button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
