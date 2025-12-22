/**
 * Generic Error Modal Component
 * 
 * A reusable modal component for displaying error messages.
 * Uses theme colors and gradients for a modern, sleek design.
 * 
 * Adapted from kitsu-fe/components/onboarding/GenericErrorModal.js
 */

export default function GenericErrorModal({
  visible,
  onClose,
  title,
  message,
  fields,
  accent,
  primaryActionLabel = "OK",
  primaryActionOnClick,
  secondaryActionLabel,
  secondaryActionOnClick,
  icon,
  primaryActionRed = false,
  type = 'error', // 'error', 'success', 'info'
}) {
  if (!visible) return null;

  // Default accent styles based on type
  const getDefaultAccent = () => {
    switch (type) {
      case 'success':
        return {
          iconGradient: 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.3) 100%)',
          iconBorder: 'var(--color-status-success)',
          iconShadow: 'rgba(16, 185, 129, 0.3)',
          headingGradient: 'linear-gradient(135deg, var(--color-status-success) 0%, #059669 100%)',
          iconStroke: 'var(--color-status-success)',
        };
      case 'info':
        return {
          iconGradient: 'linear-gradient(135deg, rgba(59, 130, 246, 0.2) 0%, rgba(37, 99, 235, 0.3) 100%)',
          iconBorder: 'var(--color-status-info)',
          iconShadow: 'rgba(59, 130, 246, 0.3)',
          headingGradient: 'linear-gradient(135deg, var(--color-status-info) 0%, #2563eb 100%)',
          iconStroke: 'var(--color-status-info)',
        };
      case 'error':
      default:
        return {
          iconGradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(220, 38, 38, 0.3) 100%)',
          iconBorder: 'var(--color-status-error)',
          iconShadow: 'rgba(239, 68, 68, 0.3)',
          headingGradient: 'linear-gradient(135deg, var(--color-status-error) 0%, #DC2626 100%)',
          iconStroke: 'var(--color-status-error)',
        };
    }
  };

  const defaultAccent = getDefaultAccent();
  const accentStyles = { ...defaultAccent, ...(accent || {}) };

  const handlePrimary = () => {
    if (typeof primaryActionOnClick === "function") {
      primaryActionOnClick();
    } else {
      onClose?.();
    }
  };

  const handleSecondary = () => {
    if (typeof secondaryActionOnClick === "function") {
      secondaryActionOnClick();
    }
  };

  // Default icons based on type
  const getDefaultIcon = () => {
    switch (type) {
      case 'success':
        return (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 13l4 4L19 7"
              stroke={accentStyles.iconStroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'info':
        return (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              stroke={accentStyles.iconStroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
      case 'error':
      default:
        return (
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 8V13"
              stroke={accentStyles.iconStroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M12 16H12.01"
              stroke={accentStyles.iconStroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M10.29 3.86L1.82 18C1.44 18.66 1.93 19.5 2.71 19.5H21.29C22.07 19.5 22.56 18.66 22.18 18L13.71 3.86C13.33 3.2 12.37 3.2 11.99 3.86H10.29Z"
              stroke={accentStyles.iconStroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        );
    }
  };

  return (
    <>
      <div
        className="generic-modal-overlay"
        onClick={onClose}
      >
        <div
          className="generic-modal-content"
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="generic-modal-icon"
            style={{
              background: accentStyles.iconGradient,
              borderColor: accentStyles.iconBorder,
              boxShadow: `0 8px 24px ${accentStyles.iconShadow}`,
            }}
          >
            {icon || getDefaultIcon()}
          </div>
          <h2
            className="generic-modal-title"
            style={{
              background: accentStyles.headingGradient,
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            {title}
          </h2>
          <p className="generic-modal-message">
            {message.includes(':') ? (
              <>
                <span className="modal-message-label">{message.split(':')[0]}:</span>
                <span className="modal-message-value">{message.substring(message.indexOf(':') + 1).trim()}</span>
              </>
            ) : (
              message
            )}
          </p>
          {fields && fields.length > 0 && (
            <ul className="generic-modal-fields">
              {fields.map((field, index) => (
                <li key={index}>{field}</li>
              ))}
            </ul>
          )}
          <div className="generic-modal-actions">
            {secondaryActionLabel && secondaryActionOnClick && (
              <button
                className="generic-modal-btn secondary"
                onClick={handleSecondary}
              >
                {secondaryActionLabel}
              </button>
            )}
            <button
              className={`generic-modal-btn primary ${primaryActionRed ? 'red' : ''}`}
              onClick={handlePrimary}
            >
              {primaryActionLabel}
            </button>
          </div>
        </div>
      </div>
      <style jsx>{`
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </>
  );
}

