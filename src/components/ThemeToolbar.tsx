import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import type { ThemePalette } from '../types/loyalty';

const PALETTES: Array<{
  id: ThemePalette;
  label: string;
  swatch: string;
  ring: string;
}> = [
  { id: 'obsidian', label: 'Black', swatch: '#0e0e11', ring: '#c9a86a' },
  { id: 'gold', label: 'Gold', swatch: '#c9a252', ring: '#f5dc99' },
  { id: 'cream', label: 'Cream', swatch: '#f3ead9', ring: '#9c7631' },
  { id: 'white', label: 'White', swatch: '#ffffff', ring: '#141416' },
];

export function ThemeToolbar() {
  const { palette, isDark, setPalette, toggleDarkLight } = useTheme();

  return (
    <div className="border-b border-[var(--yos-border)] bg-[var(--yos-surface)]/75">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--yos-text-muted)]">
          Atelier Palette · Black, Gold, Cream &amp; White
        </span>

        <div className="flex items-center gap-2 sm:gap-3">
          <div
            role="radiogroup"
            aria-label="Color theme options"
            className="flex items-center gap-1 p-1 rounded-lg bg-[var(--yos-surface-alt)] border border-[var(--yos-border)]"
          >
            {PALETTES.map((item) => {
              const active = palette === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPalette(item.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-[var(--yos-surface)] text-[var(--yos-text)] shadow-xs border border-[var(--yos-border-strong)]'
                      : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] border border-transparent'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0 border"
                    style={{ backgroundColor: item.swatch, borderColor: item.ring }}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={toggleDarkLight}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-lg border border-[var(--yos-border)] bg-[var(--yos-surface)] text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-border-strong)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            <span>{isDark ? 'Light' : 'Dark'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
