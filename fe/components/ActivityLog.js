import { useApp } from '../contexts/AppContext';

export default function ActivityLog() {
  const { activityLog } = useApp();

  return (
    <div className="activity-log" id="activity-log">
      {activityLog.length === 0 ? (
        <div className="activity-item activity-placeholder">
          <div className="activity-time">--:--:--</div>
          <div className="activity-message">No activity yet</div>
        </div>
      ) : (
        activityLog.map((entry, index) => (
          <div key={index} className="activity-item">
            <div className="activity-time">{entry.time}</div>
            <div className="activity-message">
              {entry.message}
              {entry.details && ` - ${entry.details}`}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

