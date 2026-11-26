import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { AppView } from '../types/loyalty';

interface TopNavProps {
  activeView: AppView;
  onNavigate: (view: AppView, sectionId?: string) => void;
  hasCustomerSession: boolean;
  isOwnerAuthenticated: boolean;
}

export function TopNav({
  activeView,
  onNavigate,
  hasCustomerSession,
  isOwnerAuthenticated,
}: TopNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLinkClick = (view: AppView, sectionId?: string) => {
    setMobileMenuOpen(false);
    onNavigate(view, sectionId);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--yos-border)] bg-[var(--yos-bg)]/92 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line brand wordmark */}
        <button
          type="button"
          onClick={() => handleLinkClick('landing')}
          className="font-display text-xl sm:text-2xl font-semibold tracking-[0.18em] text-[var(--yos-text)] whitespace-nowrap shrink-0 cursor-pointer hover:opacity-85 transition-opacity"
        >
          YOS COLLECTION
        </button>

        {/* Zone 2: Concise single-line navigation links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[var(--yos-text-muted)]"
        >
          <button
            type="button"
            onClick={() => handleLinkClick('landing')}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
              activeView === 'landing'
                ? 'text-[var(--yos-text)] border-b border-[var(--yos-accent)]'
                : 'hover:text-[var(--yos-text)]'
            }`}
          >
            Boutique
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('customer')}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
              activeView === 'customer'
                ? 'text-[var(--yos-text)] border-b border-[var(--yos-accent)]'
                : 'hover:text-[var(--yos-text)]'
            }`}
          >
            My Stamp Card
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('landing', 'boutique-locations')}
            className="whitespace-nowrap shrink-0 pb-0.5 hover:text-[var(--yos-text)] transition-colors cursor-pointer"
          >
            Locations
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('owner')}
            className={`whitespace-nowrap shrink-0 pb-0.5 transition-colors cursor-pointer ${
              activeView === 'owner'
                ? 'text-[var(--yos-text)] border-b border-[var(--yos-accent)]'
                : 'hover:text-[var(--yos-text)]'
            }`}
          >
            Owner Portal
          </button>
        </nav>

        {/* Zone 3: Single primary action */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() =>
              handleLinkClick(activeView === 'customer' ? 'owner' : 'customer')
            }
            className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-xs font-semibold tracking-[0.06em] rounded-md bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] hover:bg-[var(--yos-accent-strong)] transition-colors whitespace-nowrap shrink-0 min-h-[40px] cursor-pointer"
          >
            {activeView === 'customer'
              ? isOwnerAuthenticated
                ? 'Owner Dashboard'
                : 'Owner Login'
              : hasCustomerSession
              ? 'View My Card'
              : 'Get Stamp Card'}
          </button>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            className="md:hidden inline-flex items-center justify-center w-11 h-11 rounded-md border border-[var(--yos-border)] text-[var(--yos-text)] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-[var(--yos-border)] bg-[var(--yos-surface)] px-4 py-4 space-y-1">
          <button
            type="button"
            onClick={() => handleLinkClick('landing')}
            className="w-full text-left px-3 py-3 text-sm font-medium text-[var(--yos-text)] rounded-md hover:bg-[var(--yos-surface-alt)]"
          >
            Boutique
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('customer')}
            className="w-full text-left px-3 py-3 text-sm font-medium text-[var(--yos-text)] rounded-md hover:bg-[var(--yos-surface-alt)]"
          >
            My Stamp Card
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('landing', 'boutique-locations')}
            className="w-full text-left px-3 py-3 text-sm font-medium text-[var(--yos-text)] rounded-md hover:bg-[var(--yos-surface-alt)]"
          >
            Locations
          </button>
          <button
            type="button"
            onClick={() => handleLinkClick('owner')}
            className="w-full text-left px-3 py-3 text-sm font-medium text-[var(--yos-text)] rounded-md hover:bg-[var(--yos-surface-alt)]"
          >
            Owner Portal
          </button>
        </div>
      )}
    </header>
  );
}
