'use client';

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
}

export default function ToggleSwitch({ enabled, onChange }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!enabled);
      }}
      style={{
        width: '56px',
        height: '32px',
        minWidth: '56px',
        minHeight: '32px',
        position: 'relative',
      }}
      className={`flex-shrink-0 rounded-full transition-colors duration-300 ${
        enabled ? 'bg-[#FFC857]' : 'bg-gray-300'
      }`}
    >
      <span
        style={{
          width: '24px',
          height: '24px',
          position: 'absolute',
          top: '4px',
          left: enabled ? '28px' : '4px',
          transition: 'left 0.3s ease',
        }}
        className="rounded-full bg-white shadow-md"
      />
    </button>
  );
}
