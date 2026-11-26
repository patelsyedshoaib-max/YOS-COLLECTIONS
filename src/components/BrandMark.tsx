import { motion } from 'motion/react';

interface HangerIconProps {
  className?: string;
  strokeWidth?: number;
}

export function HangerIcon({ className = 'w-6 h-6', strokeWidth = 1.65 }: HangerIconProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Couture hanger hook */}
      <path
        d="M24 14.5V12.5C24 10.2 25.8 8.5 28 8.5C30.2 8.5 31.8 10.2 31.8 12.2C31.8 14.2 30.1 15.6 28.2 16.4L24 18.2"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sculpted hanger shoulders and crossbar */}
      <path
        d="M24 18.2L7.5 29.8C5.8 31 6.6 33.6 8.7 33.6H39.3C41.4 33.6 42.2 31 40.5 29.8L24 18.2Z"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner tailored bar */}
      <path
        d="M15.5 29.6H32.5"
        stroke="currentColor"
        strokeWidth={Math.max(1.2, strokeWidth - 0.35)}
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

interface StampSlotProps {
  index: number;
  filled: boolean;
  isNewest?: boolean;
  compact?: boolean;
}

export function YosStampSlot({
  index,
  filled,
  isNewest = false,
  compact = false,
}: StampSlotProps) {
  const slotLabel = String(index).padStart(2, '0');
  const sizeClass = compact
    ? 'w-14 h-14 sm:w-16 sm:h-16'
    : 'w-20 h-20 sm:w-24 sm:h-24';

  return (
    <div
      className="flex flex-col items-center justify-center"
      aria-label={filled ? `Stamp ${index} earned` : `Stamp ${index} empty`}
    >
      <div className={`relative ${sizeClass} rounded-full flex items-center justify-center`}>
        {filled ? (
          <motion.div
            initial={isNewest ? { scale: 1.45, opacity: 0, rotate: -14 } : { scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{
              type: 'spring',
              stiffness: 290,
              damping: 20,
              delay: isNewest ? 0.05 : index * 0.03,
            }}
            className="w-full h-full rounded-full yos-gold-foil p-[2px] shadow-[0_8px_22px_rgba(180,138,58,0.28)]"
          >
            <div className="w-full h-full rounded-full bg-[linear-gradient(155deg,#f4de9e_0%,#cfa656_48%,#8f6a24_100%)] flex flex-col items-center justify-center relative overflow-hidden border border-black/15">
              {/* Engraved inner ring */}
              <div className="absolute inset-[4px] rounded-full border border-[#2b1e08]/30 pointer-events-none" />
              <HangerIcon
                className={`${compact ? 'w-6 h-6' : 'w-8 h-8 sm:w-9 sm:h-9'} text-[#1b1305] -mt-0.5`}
                strokeWidth={2}
              />
              <span
                className={`font-display font-bold tracking-[0.16em] text-[#1b1305] leading-none ${
                  compact ? 'text-[7px]' : 'text-[8px] sm:text-[9px]'
                }`}
              >
                YOS
              </span>
              {!compact && (
                <span className="font-mono text-[7px] tracking-[0.14em] text-[#2c1f09]/80 leading-none mt-0.5 tabular-nums">
                  {slotLabel}
                </span>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="w-full h-full rounded-full border border-dashed border-[var(--yos-border-strong)] bg-[var(--yos-surface-alt)]/40 flex flex-col items-center justify-center transition-colors duration-200">
            <HangerIcon
              className={`${compact ? 'w-5 h-5' : 'w-6 h-6 sm:w-7 sm:h-7'} text-[var(--yos-text-muted)] opacity-35`}
              strokeWidth={1.4}
            />
            <span className="font-mono text-[10px] text-[var(--yos-text-muted)] opacity-60 tabular-nums mt-0.5">
              {slotLabel}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
