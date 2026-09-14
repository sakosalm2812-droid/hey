import './ProgressBar.css';

export function ProgressBar({
  value = 0,
  max = 100,
  showLabel = false,
  label,
  variant = 'default',
  size = 'md',
  animated = false,
  striped = false,
  className = '',
  'aria-label': ariaLabel,
  'aria-valuetext': ariaValueText,
}) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  const displayLabel = label || (showLabel ? `${Math.round(percentage)}%` : null);

  return (
    <div
      className={`hey-progress hey-progress--${variant} hey-progress--${size} ${animated ? 'hey-progress--animated' : ''} ${striped ? 'hey-progress--striped' : ''} ${className}`}
      role="progressbar"
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
      aria-valuetext={ariaValueText}
    >
      <div
        className="hey-progress__track"
        aria-hidden="true"
      >
        <div
          className="hey-progress__fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
      {displayLabel && <span className="hey-progress__label">{displayLabel}</span>}
    </div>
  );
}

ProgressBar.displayName = 'ProgressBar';

export function CircularProgress({
  value = 0,
  max = 100,
  size = 48,
  strokeWidth = 4,
  variant = 'default',
  showValue = false,
  className = '',
  'aria-label': ariaLabel,
}) {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className={`hey-circular-progress hey-circular-progress--${variant} ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(percentage)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={ariaLabel}
    >
      <svg className="hey-circular-progress__svg" width={size} height={size}>
        <circle
          className="hey-circular-progress__track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <circle
          className="hey-circular-progress__fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transform: 'rotate(-90deg)',
            transformOrigin: 'center',
            transition: 'stroke-dashoffset 0.3s var(--ease)',
          }}
        />
      </svg>
      {showValue && (
        <div className="hey-circular-progress__value">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
}

CircularProgress.displayName = 'CircularProgress';

export function StepProgress({ steps, currentStep, variant = 'default', className = '' }) {
  return (
    <div className={`hey-step-progress hey-step-progress--${variant} ${className}`} role="list" aria-label="Progress steps">
      {steps.map((step, index) => {
        const isComplete = index < currentStep;
        const isCurrent = index === currentStep;
        const stepNumber = index + 1;

        return (
          <div key={step.id || index} className="hey-step-progress__item" role="listitem">
            <div className={`hey-step-progress__marker ${isComplete ? 'hey-step-progress__marker--complete' : ''} ${isCurrent ? 'hey-step-progress__marker--current' : ''}`}>
              {isComplete ? '✓' : stepNumber}
            </div>
            <div className="hey-step-progress__content">
              <span className="hey-step-progress__label">{step.label}</span>
              {step.description && <span className="hey-step-progress__description">{step.description}</span>}
            </div>
            {index < steps.length - 1 && <div className="hey-step-progress__line" />}
          </div>
        );
      })}
    </div>
  );
}

StepProgress.displayName = 'StepProgress';