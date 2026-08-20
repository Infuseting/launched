import React from 'react';

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  onChange?: (value: number) => void;
  formatValue?: (val: number) => string;
}

export const Slider = React.forwardRef<HTMLInputElement, SliderProps>(({
  label,
  min,
  max,
  step = 1,
  value,
  unit = '',
  onChange,
  formatValue,
  className = '',
  ...props
}, ref) => {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    if (!isNaN(val) && onChange) {
      onChange(val);
    }
  };

  const displayVal = formatValue ? formatValue(value) : `${value}${unit ? ` ${unit}` : ''}`;

  return (
    <div className={`space-y-2.5 ${className}`}>
      {label && (
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-white/70 tracking-wide">{label}</span>
          <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-500/20 px-2 py-0.5 rounded-lg tabular-nums">
            {displayVal}
          </span>
        </div>
      )}

      <div className="relative flex items-center h-6 group">
        {/* Track Background */}
        <div className="absolute inset-x-0 h-2 bg-neutral-800/90 rounded-full overflow-hidden border border-white/5">
          {/* Progress Fill */}
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-75"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Real Native Range Input over the custom track */}
        <input
          ref={ref}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleChange}
          className="absolute inset-x-0 w-full h-6 opacity-0 cursor-pointer z-10"
          {...props}
        />

        {/* Custom Thumb handle */}
        <div
          className="absolute h-4 w-4 bg-white rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)] border-2 border-emerald-500 pointer-events-none transform -translate-x-1/2 transition-transform group-hover:scale-125"
          style={{ left: `${percentage}%` }}
        />
      </div>
    </div>
  );
});

Slider.displayName = 'Slider';
export default Slider;
