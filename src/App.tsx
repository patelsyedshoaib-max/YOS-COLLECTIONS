/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useState } from 'react';
import { CustomerPortal } from './components/CustomerPortal';
import { LandingView } from './components/LandingView';
import { OwnerDashboard } from './components/OwnerDashboard';
import { ThemeToolbar } from './components/ThemeToolbar';
import { ToastContainer } from './components/ToastContainer';
import { TopNav } from './components/TopNav';
import { ThemeProvider } from './context/ThemeContext';
import { api, subscribeToSyncEvents } from './lib/api';
import type {
  AppView,
  CustomerBundle,
  StoreLocation,
  ToastMessage,
} from './types/loyalty';

function YosCollectionApp() {
  const [activeView, setActiveView] = useState<AppView>('landing');
  const [stores, setStores] = useState<StoreLocation[]>([]);
  const [rewardText, setRewardText] = useState('20% Off Your Next Purchase');
  const [preferredStoreId, setPreferredStoreId] = useState<string | null>(null);

  // Customer card state (non-privileged ID kept in sessionStorage for convenience)
  const [customerBundle, setCustomerBundle] = useState<CustomerBundle | null>(null);

  // Owner session token kept strictly in React memory (never persisted to localStorage)
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [ownerRefreshSignal, setOwnerRefreshSignal] = useState(0);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const loadBootstrap = useCallback(async () => {
    try {
      const data = await api.getBootstrap();
      setStores(data.stores);
      setRewardText(data.rewardText);
    } catch {
      // Keep graceful defaults if initial fetch momentarily retries
    }
  }, []);

  const refreshCustomerCard = useCallback(async (customerId: string) => {
    try {
      const updated = await api.getCustomerCard(customerId);
      setCustomerBundle(updated);
    } catch {
      // Ignore silent refresh error
    }
  }, []);

  // Load initial boutique data and restore customer card if present in current tab session
  useEffect(() => {
    void loadBootstrap();
    try {
      const savedCustomerId = window.sessionStorage.getItem('yos_active_customer_id');
      if (savedCustomerId) {
        void refreshCustomerCard(savedCustomerId);
      }
    } catch {
      // Ignore storage access errors
    }
  }, [loadBootstrap, refreshCustomerCard]);

  // Live cross-device synchronization via Server-Sent Events
  useEffect(() => {
    const unsubscribe = subscribeToSyncEvents((event) => {
      if (event.type === 'stores_updated' || event.type === 'settings_updated') {
        void loadBootstrap();
        if (customerBundle?.customer.id) {
          void refreshCustomerCard(customerBundle.customer.id);
        }
        setOwnerRefreshSignal((n) => n + 1);
      } else if (
        event.type === 'stamp_updated' ||
        event.type === 'customer_updated' ||
        event.type === 'customer_registered'
      ) {
        if (
          customerBundle?.customer.id &&
          (!event.customerId || event.customerId === customerBundle.customer.id)
        ) {
          void refreshCustomerCard(customerBundle.customer.id);
        }
        setOwnerRefreshSignal((n) => n + 1);
      }
    });

    return unsubscribe;
  }, [customerBundle?.customer.id, loadBootstrap, refreshCustomerCard]);

  const handleNavigate = (view: AppView, sectionId?: string) => {
    setActiveView(view);
    if (sectionId) {
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBundleLoaded = (bundle: CustomerBundle) => {
    setCustomerBundle(bundle);
    try {
      window.sessionStorage.setItem('yos_active_customer_id', bundle.customer.id);
    } catch {
      // Ignore storage errors
    }
  };

  const handleClearCustomerSession = () => {
    setCustomerBundle(null);
    try {
      window.sessionStorage.removeItem('yos_active_customer_id');
    } catch {
      // Ignore storage errors
    }
  };

  const handleOpenCustomerWithStore = (storeId: string) => {
    setPreferredStoreId(storeId);
    handleNavigate('customer');
  };

  return (
    <div className="min-h-dvh flex flex-col bg-[var(--yos-bg)] text-[var(--yos-text)]">
      <TopNav
        activeView={activeView}
        onNavigate={handleNavigate}
        hasCustomerSession={Boolean(customerBundle)}
        isOwnerAuthenticated={Boolean(ownerToken)}
      />

      <ThemeToolbar />

      <div className="flex-1">
        {activeView === 'landing' && (
          <LandingView
            stores={stores}
            rewardText={rewardText}
            onNavigate={(view) => handleNavigate(view)}
            onOpenCustomerWithStore={handleOpenCustomerWithStore}
          />
        )}

        {activeView === 'customer' && (
          <CustomerPortal
            stores={stores}
            rewardText={rewardText}
            bundle={customerBundle}
            preferredStoreId={preferredStoreId}
            onBundleLoaded={handleBundleLoaded}
            onClearSession={handleClearCustomerSession}
            onToast={pushToast}
          />
        )}

        {activeView === 'owner' && (
          <OwnerDashboard
            ownerToken={ownerToken}
            onLoginSuccess={(token) => setOwnerToken(token)}
            onLogout={() => setOwnerToken(null)}
            onStoresOrSettingsChanged={() => void loadBootstrap()}
            onToast={pushToast}
            refreshSignal={ownerRefreshSignal}
          />
        )}
      </div>

      <footer className="border-t border-[var(--yos-border)] bg-[var(--yos-surface)]/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--yos-text-muted)]">
          <span className="font-display text-sm tracking-[0.16em] text-[var(--yos-text)]">
            YOS COLLECTION
          </span>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => handleNavigate('customer')}
              className="hover:text-[var(--yos-text)] transition-colors cursor-pointer"
            >
              Customer Card
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() => handleNavigate('owner')}
              className="hover:text-[var(--yos-text)] transition-colors cursor-pointer"
            >
              Owner Portal
            </button>
            <span aria-hidden="true">·</span>
            <span>© {new Date().getFullYear()} YOS COLLECTION</span>
          </div>
        </div>
      </footer>

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <YosCollectionApp />
    </ThemeProvider>
  );
}
