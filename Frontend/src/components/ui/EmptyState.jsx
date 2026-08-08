import React from 'react';

export default function EmptyState({ icon = '📊', message = 'No data available yet.' }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div>{message}</div>
    </div>
  );
}
