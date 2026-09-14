import { forwardRef, useRef, useState } from 'react';
import './Slider.css';

export const Slider = forwardRef((
  {
    label,
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    showValue = false,
    valueFormatter,
    marks,
    className = '',
    id,
    name,
    'aria-label': ariaLabel,
    'aria-valuetext': ariaValueText,
    ...props
  },
  _ref
) => {
  const trackRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [dragging, setDragging] = useState(false);

  const percentage = ((value - min) / (max - min)) * 100;

  const handleMouseDown = (e) => {
    if (disabled) return;
    setDragging(true);
    handleMove(e);
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e) => {
    if (disabled) return;
    setDragging(true);
    handleMove(e.touches[0]);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleMouseUp);
  };

  const handleMove = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let newPercentage = ((clientX - rect.left) / rect.width) * 100;
    newPercentage = Math.max(0, Math.min(100, newPercentage));
    const newValue = min + (newPercentage / 100) * (max - min);
    const steppedValue = Math.round(newValue / step) * step;
    const clampedValue = Math.max(min, Math.min(max, steppedValue));
    onChange?.(clampedValue);
  };

  const handleTouchMove = (e) => {
    e.preventDefault();
    handleMove(e.touches[0]);
  };

  const handleMouseUp = () => {
    setDragging(false);
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchend', handleMouseUp);
  };

  const handleKeyDown = (e) => {
    let newValue;
    const stepValue = step;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        newValue = Math.min(max, value + stepValue);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        newValue = Math.max(min, value - stepValue);
        break;
      case 'Home':
        e.preventDefault();
        newValue = min;
        break;
      case 'End':
        e.preventDefault();
        newValue = max;
        break;
      case 'PageUp':
        e.preventDefault();
        newValue = Math.min(max, value + stepValue * 10);
        break;
      case 'PageDown':
        e.preventDefault();
        newValue = Math.max(min, value - stepValue * 10);
        break;
      default:
        return;
    }
    onChange?.(newValue);
  };

  const displayValue = valueFormatter ? valueFormatter(value) : value;

  return (
    <div className={`hey-slider ${className} ${disabled ? 'hey-slider--disabled' : ''} ${focused ? 'hey-slider--focused' : ''} ${dragging ? 'hey-slider--dragging' : ''}`}>
      {label && (
        <label htmlFor={id} className="hey-slider__label">
          {label}
          {showValue && <span className="hey-slider__value">{displayValue}</span>}
        </label>
      )}
      <div className="hey-slider__track-wrapper" ref={trackRef} role="slider" tabIndex={disabled ? -1 : 0} aria-label={ariaLabel} aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} aria-valuetext={ariaValueText || displayValue} onMouseDown={handleMouseDown} onTouchStart={handleTouchStart} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={handleKeyDown} {...props}>
        <div className="hey-slider__track" style={{ '--hey-slider-progress': `${percentage}%` }}>
          <div className="hey-slider__progress" style={{ width: `${percentage}%` }} />
          <div className="hey-slider__thumb" style={{ left: `${percentage}%` }} />
        </div>
        {marks && marks.map((mark, index) => (
          <div key={index} className="hey-slider__mark" style={{ left: `${((mark.value - min) / (max - min)) * 100}%` }}>
            {mark.label && <span className="hey-slider__mark-label">{mark.label}</span>}
          </div>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
});

Slider.displayName = 'Slider';

export const RangeSlider = forwardRef((
  {
    label,
    value = [0, 100],
    onChange,
    min = 0,
    max = 100,
    step = 1,
    disabled = false,
    showValue = false,
    valueFormatter,
    className = '',
    name,
    'aria-label': ariaLabel,
    ...props
  },
  _ref
) => {
  const trackRef = useRef(null);
  const [focusedThumb, setFocusedThumb] = useState(null);
  const [draggingThumb, setDraggingThumb] = useState(null);

  const [minValue, maxValue] = value;
  const minPercentage = ((minValue - min) / (max - min)) * 100;
  const maxPercentage = ((maxValue - min) / (max - min)) * 100;

  const handleMouseDown = (thumb) => (e) => {
    if (disabled) return;
    setDraggingThumb(thumb);
    handleMove(e, thumb);
    document.addEventListener('mousemove', (e) => handleMove(e, thumb));
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (thumb) => (e) => {
    if (disabled) return;
    setDraggingThumb(thumb);
    handleMove(e.touches[0], thumb);
    document.addEventListener('touchmove', (e) => handleTouchMove(e, thumb), { passive: false });
    document.addEventListener('touchend', handleMouseUp);
  };

  const handleMove = (e, thumb) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    let newPercentage = ((clientX - rect.left) / rect.width) * 100;
    newPercentage = Math.max(0, Math.min(100, newPercentage));
    const newValue = min + (newPercentage / 100) * (max - min);
    const steppedValue = Math.round(newValue / step) * step;
    const clampedValue = Math.max(min, Math.min(max, steppedValue));

    if (thumb === 'min') {
      const newMin = Math.min(clampedValue, maxValue - step);
      onChange?.([newMin, maxValue]);
    } else {
      const newMax = Math.max(clampedValue, minValue + step);
      onChange?.([minValue, newMax]);
    }
  };

  const handleTouchMove = (e, thumb) => {
    e.preventDefault();
    handleMove(e.touches[0], thumb);
  };

  const handleMouseUp = () => {
    setDraggingThumb(null);
    document.removeEventListener('mousemove', handleMove);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.removeEventListener('touchend', handleMouseUp);
  };

  const handleKeyDown = (e, thumb) => {
    let newValue = thumb === 'min' ? minValue : maxValue;
    const stepValue = step;
    const otherValue = thumb === 'min' ? maxValue : minValue;
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowUp':
        e.preventDefault();
        newValue = Math.min(max, thumb === 'min' ? otherValue - step : newValue + stepValue);
        break;
      case 'ArrowLeft':
      case 'ArrowDown':
        e.preventDefault();
        newValue = Math.max(min, thumb === 'min' ? newValue - stepValue : otherValue + step);
        break;
      case 'Home':
        e.preventDefault();
        newValue = min;
        break;
      case 'End':
        e.preventDefault();
        newValue = max;
        break;
      default:
        return;
    }
    if (thumb === 'min') onChange?.([newValue, maxValue]);
    else onChange?.([minValue, newValue]);
  };

  return (
    <div className={`hey-range-slider ${className} ${disabled ? 'hey-slider--disabled' : ''}`}>
      {label && (
        <label className="hey-slider__label">
          {label}
          {showValue && (
            <span className="hey-slider__value">
              {valueFormatter ? `${valueFormatter(minValue)} – ${valueFormatter(maxValue)}` : `${minValue} – ${maxValue}`}
            </span>
          )}
        </label>
      )}
      <div className="hey-slider__track-wrapper" ref={trackRef} role="slider" aria-label={ariaLabel} aria-valuemin={min} aria-valuemax={max} {...props}>
        <div className="hey-slider__track" style={{ '--hey-slider-progress-start': `${minPercentage}%`, '--hey-slider-progress-end': `${maxPercentage}%` }}>
          <div className="hey-slider__progress" style={{ left: `${minPercentage}%`, right: `${100 - maxPercentage}%` }} />
          <div className={`hey-slider__thumb ${focusedThumb === 'min' || draggingThumb === 'min' ? 'hey-slider__thumb--focused' : ''}`} style={{ left: `${minPercentage}%` }} tabIndex={disabled ? -1 : 0} onFocus={() => setFocusedThumb('min')} onBlur={() => setFocusedThumb(null)} onMouseDown={handleMouseDown('min')} onTouchStart={handleTouchStart('min')} onKeyDown={(e) => handleKeyDown(e, 'min')} aria-valuenow={minValue} aria-valuetext={valueFormatter ? valueFormatter(minValue) : minValue} />
          <div className={`hey-slider__thumb ${focusedThumb === 'max' || draggingThumb === 'max' ? 'hey-slider__thumb--focused' : ''}`} style={{ left: `${maxPercentage}%` }} tabIndex={disabled ? -1 : 0} onFocus={() => setFocusedThumb('max')} onBlur={() => setFocusedThumb(null)} onMouseDown={handleMouseDown('max')} onTouchStart={handleTouchStart('max')} onKeyDown={(e) => handleKeyDown(e, 'max')} aria-valuenow={maxValue} aria-valuetext={valueFormatter ? valueFormatter(maxValue) : maxValue} />
        </div>
      </div>
      <input type="hidden" name={name ? `${name}[min]` : undefined} value={minValue} />
      <input type="hidden" name={name ? `${name}[max]` : undefined} value={maxValue} />
    </div>
  );
});

RangeSlider.displayName = 'RangeSlider';