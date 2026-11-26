import {
  AlertCircle,
  Award,
  BarChart3,
  Bell,
  Building2,
  KeyRound,
  Lock,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ApiError, api, formatDateTime } from '../lib/api';
import type {
  OwnerDashboardData,
  StoreLocation,
  ToastMessage,
} from '../types/loyalty';
import { HangerIcon } from './BrandMark';
import { CustomerDetailDrawer } from './CustomerDetailDrawer';
import { QrScannerModal } from './QrScannerModal';

interface OwnerDashboardProps {
  ownerToken: string | null;
  onLoginSuccess: (token: string) => void;
  onLogout: () => void;
  onStoresOrSettingsChanged: () => void;
  onToast: (toast: Omit<ToastMessage, 'id'>) => void;
  refreshSignal: number;
}

type OwnerTab = 'overview' | 'customers' | 'locations' | 'security';
type ActivityPeriod = 'daily' | 'weekly' | 'monthly';
type CustomerFilter = 'all' | 'in_progress' | 'reward_ready' | 'blocked';

export function OwnerDashboard({
  ownerToken,
  onLoginSuccess,
  onLogout,
  onStoresOrSettingsChanged,
  onToast,
  refreshSignal,
}: OwnerDashboardProps) {
  // Login state
  const [loginPin, setLoginPin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<OwnerTab>('overview');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [activityPeriod, setActivityPeriod] = useState<ActivityPeriod>('daily');
  const [dashboard, setDashboard] = useState<OwnerDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Directory filters
  const [searchQuery, setSearchQuery] = useState('');
  const [customerFilter, setCustomerFilter] = useState<CustomerFilter>('all');

  // Modals / Drawers
  const [scannerOpen, setScannerOpen] = useState(false);
  const [drawerCustomer, setDrawerCustomer] = useState<{
    id: string;
    storeId?: string;
  } | null>(null);

  // Locations & Reward Settings
  const [rewardDraft, setRewardDraft] = useState('');
  const [savingReward, setSavingReward] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreLocation, setNewStoreLocation] = useState('');
  const [newStoreReward, setNewStoreReward] = useState('');
  const [creatingStore, setCreatingStore] = useState(false);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);
  const [editStoreDraft, setEditStoreDraft] = useState({
    name: '',
    location: '',
    rewardOverride: '',
  });

  // Change PIN form
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [pinUpdating, setPinUpdating] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    if (!ownerToken) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.ownerGetDashboard(ownerToken, storeFilter);
      setDashboard(data);
      setRewardDraft(data.rewardText);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onLogout();
        onToast({
          type: 'error',
          title: 'Owner Session Expired',
          description: 'Please enter your Owner PIN to sign back in.',
        });
      } else {
        setLoadError(err instanceof Error ? err.message : 'Unable to load dashboard data.');
      }
    } finally {
      setLoading(false);
    }
  }, [ownerToken, storeFilter, onLogout, onToast]);

  useEffect(() => {
    if (ownerToken) {
      void fetchDashboard();
    } else {
      setDashboard(null);
    }
  }, [ownerToken, fetchDashboard, refreshSignal]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await api.ownerLogin(loginPin);
      setLoginPin('');
      onLoginSuccess(res.token);
      onToast({
        type: 'success',
        title: 'Owner Portal Unlocked',
        description: 'Authenticated securely with server-side PIN verification.',
      });
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Owner sign-in failed.');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleOwnerLogout = async () => {
    if (ownerToken) {
      try {
        await api.ownerLogout(ownerToken);
      } catch {
        // Proceed with local sign-out regardless
      }
    }
    onLogout();
    onToast({
      type: 'info',
      title: 'Signed Out',
      description: 'Owner session closed securely.',
    });
  };

  const handleSaveRewardText = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerToken) return;
    setSavingReward(true);
    try {
      const res = await api.ownerUpdateSettings(ownerToken, rewardDraft);
      setRewardDraft(res.rewardText);
      onToast({
        type: 'success',
        title: 'Reward Text Updated',
        description: `Customers will now see "${res.rewardText}".`,
      });
      onStoresOrSettingsChanged();
      void fetchDashboard();
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Could not save reward offer.',
      });
    } finally {
      setSavingReward(false);
    }
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerToken) return;
    setCreatingStore(true);
    try {
      const res = await api.ownerCreateStore(ownerToken, {
        name: newStoreName,
        location: newStoreLocation,
        rewardOverride: newStoreReward.trim() || undefined,
      });
      setNewStoreName('');
      setNewStoreLocation('');
      setNewStoreReward('');
      onToast({
        type: 'success',
        title: 'Store Location Added',
        description: `${res.store.name} is now live across all customer cards.`,
      });
      onStoresOrSettingsChanged();
      void fetchDashboard();
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Could Not Add Store',
        description: err instanceof Error ? err.message : 'Invalid store details.',
      });
    } finally {
      setCreatingStore(false);
    }
  };

  const startEditStore = (store: StoreLocation) => {
    setEditingStoreId(store.id);
    setEditStoreDraft({
      name: store.name,
      location: store.location,
      rewardOverride: store.rewardOverride || '',
    });
  };

  const handleSaveStoreEdit = async (storeId: string) => {
    if (!ownerToken) return;
    try {
      await api.ownerUpdateStore(ownerToken, storeId, {
        name: editStoreDraft.name,
        location: editStoreDraft.location,
        rewardOverride: editStoreDraft.rewardOverride.trim() || null,
      });
      setEditingStoreId(null);
      onToast({
        type: 'success',
        title: 'Boutique Location Updated',
      });
      onStoresOrSettingsChanged();
      void fetchDashboard();
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Update Failed',
        description: err instanceof Error ? err.message : 'Could not update store.',
      });
    }
  };

  const handleToggleStoreActive = async (store: StoreLocation) => {
    if (!ownerToken) return;
    try {
      await api.ownerUpdateStore(ownerToken, store.id, { isActive: !store.isActive });
      onToast({
        type: 'info',
        title: store.isActive ? 'Location Archived' : 'Location Reactivated',
        description: store.name,
      });
      onStoresOrSettingsChanged();
      void fetchDashboard();
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Action Blocked',
        description: err instanceof Error ? err.message : 'Could not update store status.',
      });
    }
  };

  const handleChangePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerToken) return;
    setPinError(null);
    if (newPin !== confirmNewPin) {
      setPinError('New PIN and Confirm New PIN must match.');
      return;
    }
    setPinUpdating(true);
    try {
      await api.ownerChangePin(ownerToken, {
        currentPin,
        newPin,
        confirmNewPin,
      });
      setCurrentPin('');
      setNewPin('');
      setConfirmNewPin('');
      onToast({
        type: 'success',
        title: 'Owner PIN Updated',
        description: 'Your new PIN has been hashed and stored securely on the server.',
      });
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Unable to update Owner PIN.');
    } finally {
      setPinUpdating(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!dashboard) return [];
    const q = searchQuery.trim().toLowerCase();
    return dashboard.customers.filter((cust) => {
      if (q) {
        const matches =
          cust.fullName.toLowerCase().includes(q) ||
          cust.mobileNumber.toLowerCase().includes(q) ||
          cust.id.toLowerCase().includes(q);
        if (!matches) return false;
      }

      const relevantCards =
        storeFilter === 'all'
          ? cust.cards
          : cust.cards.filter((c) => c.storeId === storeFilter);

      if (customerFilter === 'blocked') return cust.isBlocked;
      if (customerFilter === 'reward_ready') {
        return !cust.isBlocked && relevantCards.some((c) => c.status === 'completed');
      }
      if (customerFilter === 'in_progress') {
        return !cust.isBlocked && relevantCards.some((c) => c.status === 'in_progress' && c.currentStamps > 0);
      }
      return true;
    });
  }, [dashboard, searchQuery, customerFilter, storeFilter]);

  // ==================== OWNER LOGIN GATE ====================
  if (!ownerToken) {
    return (
      <div className="max-w-md mx-auto px-4 py-14 sm:py-20">
        <div className="rounded-2xl border border-[var(--yos-border-strong)] bg-[var(--yos-surface)] p-7 sm:p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full border border-[var(--yos-card-border)] bg-[var(--yos-surface-alt)] flex items-center justify-center mx-auto">
              <Lock className="w-5 h-5 text-[var(--yos-accent)]" />
            </div>
            <h1 className="font-display text-3xl font-medium text-[var(--yos-text)]">
              Owner Portal
            </h1>
            <p className="text-xs text-[var(--yos-text-muted)] leading-relaxed">
              Sign in with your private Owner PIN to scan customer QR codes, issue
              verified stamps, and manage YOS COLLECTION boutiques.
            </p>
          </div>

          {loginError && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-3.5 text-xs text-[var(--yos-text)] flex items-start gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-[var(--yos-danger)] shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="owner-login-pin"
                className="block text-xs font-medium text-[var(--yos-text-muted)] mb-2"
              >
                Owner Security PIN
              </label>
              <input
                id="owner-login-pin"
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,8}"
                maxLength={8}
                required
                autoFocus
                autoComplete="off"
                value={loginPin}
                onChange={(e) => setLoginPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                className="w-full h-13 px-4 rounded-xl border border-[var(--yos-border-strong)] bg-[var(--yos-bg)] text-xl font-mono tracking-[0.45em] text-center text-[var(--yos-text)]"
              />
            </div>

            {/* Tactile PIN Keypad */}
            <div className="grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() =>
                    setLoginPin((prev) => (prev.length < 8 ? `${prev}${digit}` : prev))
                  }
                  className="h-12 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] font-mono text-base font-medium text-[var(--yos-text)] hover:bg-[var(--yos-surface-alt)] transition-colors cursor-pointer"
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setLoginPin('')}
                className="h-12 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface-alt)] text-xs font-medium text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() =>
                  setLoginPin((prev) => (prev.length < 8 ? `${prev}0` : prev))
                }
                className="h-12 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] font-mono text-base font-medium text-[var(--yos-text)] hover:bg-[var(--yos-surface-alt)] transition-colors cursor-pointer"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setLoginPin((prev) => prev.slice(0, -1))}
                className="h-12 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface-alt)] text-xs font-medium text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] cursor-pointer"
              >
                Back
              </button>
            </div>

            <button
              type="submit"
              disabled={loginLoading || loginPin.length < 4}
              className="w-full h-12 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-sm font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-55 transition-colors cursor-pointer"
            >
              {loginLoading ? 'Verifying PIN…' : 'Sign In to Owner Dashboard'}
            </button>
          </form>

          <p className="text-[11px] text-center text-[var(--yos-text-muted)] pt-2 border-t border-[var(--yos-border)]">
            Protected by server-side scrypt PIN hashing and rate limiting. Customers
            cannot access owner permissions.
          </p>
        </div>
      </div>
    );
  }

  // ==================== AUTHENTICATED OWNER DASHBOARD ====================
  const chartData = dashboard ? dashboard.analytics[activityPeriod] : [];
  const pendingCount = dashboard?.completionAlerts.length || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 pb-24 md:pb-12">
      <div className="flex flex-col md:flex-row gap-6 lg:gap-8 items-start">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-4 sticky top-20 space-y-6">
          <div className="px-2 pt-1">
            <div className="flex items-center gap-2 text-xs text-[var(--yos-accent)] font-medium">
              <HangerIcon className="w-4 h-4" />
              <span>Owner Console</span>
            </div>
            <p className="font-display text-xl font-semibold text-[var(--yos-text)] mt-1">
              YOS COLLECTION
            </p>
          </div>

          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="w-full h-11 px-4 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan Customer QR</span>
          </button>

          <nav aria-label="Owner dashboard sections" className="space-y-1">
            {(
              [
                { id: 'overview', label: 'Overview & Activity', icon: BarChart3 },
                { id: 'customers', label: 'Customers', icon: Users },
                { id: 'locations', label: 'Locations & Rewards', icon: Building2 },
                { id: 'security', label: 'Security & PIN', icon: KeyRound },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 min-h-[42px] rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--yos-surface-alt)] text-[var(--yos-text)] border border-[var(--yos-border-strong)]'
                      : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] hover:bg-[var(--yos-surface-alt)]/50 border border-transparent'
                  }`}
                >
                  <span className="inline-flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'overview' && pendingCount > 0 && (
                    <span className="font-mono text-[11px] font-semibold text-[var(--yos-accent)] tabular-nums">
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-[var(--yos-border)]">
            <button
              type="button"
              onClick={handleOwnerLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 min-h-[42px] rounded-xl text-xs font-medium text-[var(--yos-text-muted)] hover:text-[var(--yos-danger)] hover:bg-[var(--yos-danger)]/10 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Owner Logout</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace Content */}
        <main className="flex-1 min-w-0 w-full space-y-6">
          {/* Top Workspace Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--yos-border)]">
            <div>
              <p className="text-xs text-[var(--yos-text-muted)]">
                Owner Admin Dashboard · Multi-Store Sync
              </p>
              <h1 className="font-display text-3xl font-medium text-[var(--yos-text)] mt-0.5">
                {activeTab === 'overview' && 'Boutique Overview & Activity'}
                {activeTab === 'customers' && 'Registered Customers'}
                {activeTab === 'locations' && 'Locations & Reward Settings'}
                {activeTab === 'security' && 'Owner PIN Security'}
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {dashboard && (
                <select
                  aria-label="Filter dashboard by boutique store location"
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="h-11 px-3.5 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] text-xs font-medium text-[var(--yos-text)]"
                >
                  <option value="all">All Boutique Locations</option>
                  {dashboard.stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                onClick={() => void fetchDashboard()}
                disabled={loading}
                aria-label="Refresh dashboard data"
                className="h-11 px-3.5 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-border-strong)] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="md:hidden h-11 px-4 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>Scan QR</span>
              </button>
            </div>
          </div>

          {loadError && (
            <div
              role="alert"
              className="rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-4 text-xs text-[var(--yos-text)]"
            >
              {loadError}
            </div>
          )}

          {/* ==================== TAB 1: OVERVIEW & ANALYTICS ==================== */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* 4-Column KPI Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-5">
                  <p className="text-xs text-[var(--yos-text-muted)]">Total Stamps Issued</p>
                  <p className="font-mono text-3xl font-semibold text-[var(--yos-text)] tabular-nums mt-2">
                    {dashboard?.kpis.totalStampsIssued ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-5">
                  <p className="text-xs text-[var(--yos-text-muted)]">Completed Reward Cards</p>
                  <p className="font-mono text-3xl font-semibold text-[var(--yos-accent)] tabular-nums mt-2">
                    {dashboard?.kpis.completedRewardCards ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-5">
                  <p className="text-xs text-[var(--yos-text-muted)]">Registered Customers</p>
                  <p className="font-mono text-3xl font-semibold text-[var(--yos-text)] tabular-nums mt-2">
                    {dashboard?.kpis.totalCustomers ?? 0}
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-5">
                  <p className="text-xs text-[var(--yos-text-muted)]">Pending Redemptions</p>
                  <p className="font-mono text-3xl font-semibold text-[var(--yos-text)] tabular-nums mt-2">
                    {dashboard?.kpis.pendingRedemptions ?? 0}
                  </p>
                </div>
              </div>

              {/* Pending 6/6 Completion Alerts (Owner Notifications) */}
              {dashboard && dashboard.completionAlerts.length > 0 && (
                <div className="rounded-2xl border border-[var(--yos-card-border)] bg-[var(--yos-surface)] p-5 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <Bell className="w-4 h-4 text-[var(--yos-accent)]" />
                      <h2 className="text-sm font-semibold text-[var(--yos-text)]">
                        Completed 6-Stamp Cards Ready for Redemption
                      </h2>
                    </div>
                    <span className="font-mono text-xs text-[var(--yos-accent)] tabular-nums">
                      {dashboard.completionAlerts.length} Pending
                    </span>
                  </div>

                  <div className="divide-y divide-[var(--yos-border)]">
                    {dashboard.completionAlerts.map((alert) => (
                      <div
                        key={`${alert.customerId}-${alert.storeId}-${alert.cycleNumber}`}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-[var(--yos-text)]">
                            {alert.customerName}{' '}
                            <span className="font-mono text-xs font-normal text-[var(--yos-text-muted)]">
                              · {alert.customerId}
                            </span>
                          </p>
                          <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                            {alert.storeName} · Cycle {alert.cycleNumber} · {alert.rewardText} ·{' '}
                            {formatDateTime(alert.completedAt)}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            setDrawerCustomer({
                              id: alert.customerId,
                              storeId: alert.storeId,
                            })
                          }
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 min-h-[40px] rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Award className="w-3.5 h-3.5" />
                          <span>Redeem / Start Cycle</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily / Weekly / Monthly Stamp Activity Chart */}
              <div className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-5 sm:p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--yos-text)]">
                      Stamp Issuing Activity
                    </h2>
                    <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                      Verified stamps added across selected locations
                    </p>
                  </div>

                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--yos-surface-alt)] border border-[var(--yos-border)] w-fit">
                    {(
                      [
                        { id: 'daily', label: 'Daily' },
                        { id: 'weekly', label: 'Weekly' },
                        { id: 'monthly', label: 'Monthly' },
                      ] as const
                    ).map((period) => (
                      <button
                        key={period.id}
                        type="button"
                        onClick={() => setActivityPeriod(period.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          activityPeriod === period.id
                            ? 'bg-[var(--yos-surface)] text-[var(--yos-text)]'
                            : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                        }`}
                      >
                        {period.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="var(--yos-border)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--yos-text-muted)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--yos-border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: 'var(--yos-text-muted)', fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'var(--yos-surface-alt)', opacity: 0.45 }}
                        contentStyle={{
                          backgroundColor: 'var(--yos-surface)',
                          borderColor: 'var(--yos-border-strong)',
                          borderRadius: '10px',
                          color: 'var(--yos-text)',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="stamps"
                        name="Stamps Issued"
                        fill="var(--yos-accent)"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Recent Stamp Activity Ledger */}
              <div className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3 pb-4 border-b border-[var(--yos-border)]">
                  <h2 className="text-base font-semibold text-[var(--yos-text)]">
                    Recent Stamp Transactions
                  </h2>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="text-xs font-semibold text-[var(--yos-accent)] hover:underline underline-offset-4 cursor-pointer"
                  >
                    Scan Customer QR
                  </button>
                </div>

                {!dashboard || dashboard.recentTransactions.length === 0 ? (
                  <div className="py-10 text-center space-y-2">
                    <p className="text-sm font-medium text-[var(--yos-text)]">
                      No stamp activity yet
                    </p>
                    <p className="text-xs text-[var(--yos-text-muted)]">
                      Once customers register and you scan their QR codes with your Owner
                      PIN, every transaction will be logged here with exact timestamps.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--yos-border)]">
                    {dashboard.recentTransactions.slice(0, 12).map((tx) => (
                      <div
                        key={tx.id}
                        className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div>
                          <button
                            type="button"
                            onClick={() =>
                              setDrawerCustomer({ id: tx.customerId, storeId: tx.storeId })
                            }
                            className="text-sm font-medium text-[var(--yos-text)] hover:text-[var(--yos-accent)] transition-colors cursor-pointer text-left"
                          >
                            {tx.customerName} ·{' '}
                            <span className="font-mono text-xs text-[var(--yos-text-muted)]">
                              {tx.customerId}
                            </span>
                          </button>
                          <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                            {tx.actionType === 'stamp_added' &&
                              `Added Stamp ${tx.stampNumber}/6`}
                            {tx.actionType === 'card_completed' && 'Completed 6-Stamp Card'}
                            {tx.actionType === 'reward_redeemed' && 'Marked Reward Redeemed'}
                            {tx.actionType === 'cycle_started' &&
                              `Started Cycle ${tx.cycleNumber}`}{' '}
                            · {tx.storeName}
                            {tx.note ? ` · ${tx.note}` : ''}
                          </p>
                        </div>
                        <span className="font-mono text-[11px] text-[var(--yos-text-muted)] tabular-nums shrink-0">
                          {formatDateTime(tx.createdAt)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 2: CUSTOMERS DIRECTORY ==================== */}
          {activeTab === 'customers' && (
            <div className="space-y-5">
              {/* Search & Filter Toolbar */}
              <div className="flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[var(--yos-text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by customer name, mobile number, or Customer ID…"
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] text-sm text-[var(--yos-text)] placeholder:text-[var(--yos-text-muted)]/70"
                  />
                </div>

                <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--yos-surface-alt)] border border-[var(--yos-border)] overflow-x-auto">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'in_progress', label: 'In Progress' },
                      { id: 'reward_ready', label: 'Reward Ready' },
                      { id: 'blocked', label: 'Blocked' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setCustomerFilter(f.id)}
                      className={`px-3 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                        customerFilter === f.id
                          ? 'bg-[var(--yos-surface)] text-[var(--yos-text)]'
                          : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Customer Table / Responsive Rows */}
              <div className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] overflow-hidden">
                {filteredCustomers.length === 0 ? (
                  <div className="py-14 px-6 text-center space-y-3">
                    <Users className="w-8 h-8 text-[var(--yos-text-muted)] mx-auto opacity-50" />
                    <p className="text-sm font-semibold text-[var(--yos-text)]">
                      No matching customers found
                    </p>
                    <p className="text-xs text-[var(--yos-text-muted)] max-w-sm mx-auto">
                      {dashboard && dashboard.customers.length === 0
                        ? 'Registered shoppers will appear here automatically once they create a YOS COLLECTION digital stamp card.'
                        : 'Try clearing your search query or switching the status filter.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-[var(--yos-border)] text-[11px] font-semibold text-[var(--yos-text-muted)]">
                          <th className="py-3.5 px-5">Customer</th>
                          <th className="py-3.5 px-4">Mobile &amp; ID</th>
                          <th className="py-3.5 px-4">Branch Progress</th>
                          <th className="py-3.5 px-4 text-right">Completed Cycles</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-5 text-right">Manage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--yos-border)] text-sm">
                        {filteredCustomers.map((cust) => {
                          const displayCard =
                            storeFilter !== 'all'
                              ? cust.cards.find((c) => c.storeId === storeFilter)
                              : cust.cards.reduce(
                                  (best, current) =>
                                    !best || current.currentStamps > best.currentStamps
                                      ? current
                                      : best,
                                  cust.cards[0]
                                );

                          return (
                            <tr
                              key={cust.id}
                              onClick={() =>
                                setDrawerCustomer({
                                  id: cust.id,
                                  storeId:
                                    storeFilter !== 'all'
                                      ? storeFilter
                                      : displayCard?.storeId,
                                })
                              }
                              className="hover:bg-[var(--yos-surface-alt)]/55 transition-colors cursor-pointer"
                            >
                              <td className="py-3.5 px-5">
                                <p className="font-medium text-[var(--yos-text)]">
                                  {cust.fullName}
                                </p>
                                <p className="text-xs text-[var(--yos-text-muted)] mt-0.5 tabular-nums">
                                  {cust.totalStampsEarned} lifetime stamps
                                </p>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-xs text-[var(--yos-text-muted)] tabular-nums">
                                <p className="text-[var(--yos-text)]">{cust.id}</p>
                                <p className="mt-0.5">{cust.mobileNumber}</p>
                              </td>
                              <td className="py-3.5 px-4 text-xs">
                                {displayCard ? (
                                  <div>
                                    <span className="font-mono font-semibold text-[var(--yos-accent)] tabular-nums">
                                      {displayCard.currentStamps}/6
                                    </span>
                                    <span className="text-[var(--yos-text-muted)]">
                                      {' '}
                                      · {displayCard.storeName}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-[var(--yos-text-muted)]">0/6</span>
                                )}
                              </td>
                              <td className="py-3.5 px-4 font-mono text-xs text-right text-[var(--yos-text)] tabular-nums">
                                {cust.totalCyclesCompleted}
                              </td>
                              <td className="py-3.5 px-4 text-xs">
                                {cust.isBlocked ? (
                                  <span className="text-[var(--yos-danger)] font-semibold">
                                    Disabled
                                  </span>
                                ) : cust.hasCompletedReward ? (
                                  <span className="text-[var(--yos-accent)] font-semibold">
                                    Reward Ready
                                  </span>
                                ) : (
                                  <span className="text-[var(--yos-success)] font-medium">
                                    Active
                                  </span>
                                )}
                              </td>
                              <td className="py-3.5 px-5 text-right">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDrawerCustomer({
                                      id: cust.id,
                                      storeId:
                                        storeFilter !== 'all'
                                          ? storeFilter
                                          : displayCard?.storeId,
                                    });
                                  }}
                                  className="px-3 py-1.5 min-h-[36px] rounded-lg border border-[var(--yos-border-strong)] text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-accent)] cursor-pointer"
                                >
                                  Inspect
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ==================== TAB 3: LOCATIONS & REWARD SETTINGS ==================== */}
          {activeTab === 'locations' && (
            <div className="space-y-6">
              {/* Editable Global Reward Text */}
              <form
                onSubmit={handleSaveRewardText}
                className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6 space-y-4"
              >
                <div className="flex items-center gap-2.5">
                  <Settings className="w-4 h-4 text-[var(--yos-accent)]" />
                  <h2 className="text-base font-semibold text-[var(--yos-text)]">
                    Default 6-Stamp Reward Offer
                  </h2>
                </div>
                <p className="text-xs text-[var(--yos-text-muted)]">
                  This text displays on customer loyalty cards and completion popups across
                  all boutiques unless a branch sets its own custom reward.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={140}
                    value={rewardDraft}
                    onChange={(e) => setRewardDraft(e.target.value)}
                    placeholder="e.g., 20% Off Your Next Purchase"
                    className="flex-1 h-11 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                  />
                  <button
                    type="submit"
                    disabled={savingReward}
                    className="h-11 px-5 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{savingReward ? 'Saving…' : 'Save Reward Text'}</span>
                  </button>
                </div>
              </form>

              {/* Existing Boutique Locations */}
              <div className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6 space-y-4">
                <h2 className="text-base font-semibold text-[var(--yos-text)]">
                  Synced Store Locations
                </h2>
                <div className="divide-y divide-[var(--yos-border)]">
                  {dashboard?.stores.map((store) => {
                    const isEditing = editingStoreId === store.id;
                    return (
                      <div key={store.id} className="py-4 space-y-3">
                        {isEditing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <input
                              type="text"
                              value={editStoreDraft.name}
                              onChange={(e) =>
                                setEditStoreDraft((d) => ({ ...d, name: e.target.value }))
                              }
                              placeholder="Store Name"
                              className="h-10 px-3 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                            />
                            <input
                              type="text"
                              value={editStoreDraft.location}
                              onChange={(e) =>
                                setEditStoreDraft((d) => ({
                                  ...d,
                                  location: e.target.value,
                                }))
                              }
                              placeholder="District / Address"
                              className="h-10 px-3 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                            />
                            <input
                              type="text"
                              value={editStoreDraft.rewardOverride}
                              onChange={(e) =>
                                setEditStoreDraft((d) => ({
                                  ...d,
                                  rewardOverride: e.target.value,
                                }))
                              }
                              placeholder="Optional branch reward override"
                              className="h-10 px-3 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                            />
                            <div className="sm:col-span-3 flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingStoreId(null)}
                                className="px-3.5 py-2 rounded-lg border border-[var(--yos-border)] text-xs text-[var(--yos-text-muted)] cursor-pointer"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleSaveStoreEdit(store.id)}
                                className="px-4 py-2 rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold cursor-pointer"
                              >
                                Save Location
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--yos-text)]">
                                {store.name}{' '}
                                <span className="text-xs font-normal text-[var(--yos-text-muted)]">
                                  · {store.location}
                                </span>
                              </p>
                              <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                                Reward: {store.effectiveRewardText} ·{' '}
                                <span
                                  className={
                                    store.isActive
                                      ? 'text-[var(--yos-success)]'
                                      : 'text-[var(--yos-warning)]'
                                  }
                                >
                                  {store.isActive ? 'Active' : 'Archived'}
                                </span>
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => startEditStore(store)}
                                className="px-3 py-2 min-h-[38px] rounded-lg border border-[var(--yos-border)] text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-border-strong)] cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleToggleStoreActive(store)}
                                className="px-3 py-2 min-h-[38px] rounded-lg border border-[var(--yos-border)] text-xs font-medium text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] cursor-pointer"
                              >
                                {store.isActive ? 'Archive' : 'Activate'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Add New Boutique Location */}
              <form
                onSubmit={handleCreateStore}
                className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6 space-y-4"
              >
                <h2 className="text-base font-semibold text-[var(--yos-text)]">
                  Add New Store Location
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label
                      htmlFor="new-store-name"
                      className="block text-xs text-[var(--yos-text-muted)] mb-1.5"
                    >
                      Boutique Name
                    </label>
                    <input
                      id="new-store-name"
                      type="text"
                      required
                      minLength={2}
                      maxLength={60}
                      value={newStoreName}
                      onChange={(e) => setNewStoreName(e.target.value)}
                      placeholder="e.g., Beverly Salon"
                      className="w-full h-11 px-3.5 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="new-store-loc"
                      className="block text-xs text-[var(--yos-text-muted)] mb-1.5"
                    >
                      Address or District
                    </label>
                    <input
                      id="new-store-loc"
                      type="text"
                      required
                      minLength={2}
                      maxLength={80}
                      value={newStoreLocation}
                      onChange={(e) => setNewStoreLocation(e.target.value)}
                      placeholder="e.g., Rodeo Drive · Suite 4"
                      className="w-full h-11 px-3.5 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="new-store-reward"
                      className="block text-xs text-[var(--yos-text-muted)] mb-1.5"
                    >
                      Custom Reward (Optional)
                    </label>
                    <input
                      id="new-store-reward"
                      type="text"
                      maxLength={140}
                      value={newStoreReward}
                      onChange={(e) => setNewStoreReward(e.target.value)}
                      placeholder="Uses global reward if blank"
                      className="w-full h-11 px-3.5 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={creatingStore}
                    className="h-11 px-5 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] inline-flex items-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{creatingStore ? 'Adding Branch…' : 'Add Store Location'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ==================== TAB 4: SECURITY & PIN ==================== */}
          {activeTab === 'security' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleChangePin}
                className="lg:col-span-7 rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6 space-y-5"
              >
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-4 h-4 text-[var(--yos-accent)]" />
                  <h2 className="text-base font-semibold text-[var(--yos-text)]">
                    Change Owner PIN
                  </h2>
                </div>

                {pinError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-3.5 text-xs text-[var(--yos-text)] flex items-start gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-[var(--yos-danger)] shrink-0 mt-0.5" />
                    <span>{pinError}</span>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="pin-current"
                    className="block text-xs font-medium text-[var(--yos-text-muted)] mb-1.5"
                  >
                    Current Owner PIN
                  </label>
                  <input
                    id="pin-current"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    maxLength={8}
                    required
                    autoComplete="off"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter current PIN"
                    className="w-full h-11 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] font-mono text-sm tracking-[0.28em] text-[var(--yos-text)] placeholder:tracking-normal placeholder:font-sans"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pin-new"
                    className="block text-xs font-medium text-[var(--yos-text-muted)] mb-1.5"
                  >
                    New Owner PIN (4 to 8 digits)
                  </label>
                  <input
                    id="pin-new"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    maxLength={8}
                    required
                    autoComplete="new-password"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter new 4–8 digit PIN"
                    className="w-full h-11 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] font-mono text-sm tracking-[0.28em] text-[var(--yos-text)] placeholder:tracking-normal placeholder:font-sans"
                  />
                </div>

                <div>
                  <label
                    htmlFor="pin-confirm"
                    className="block text-xs font-medium text-[var(--yos-text-muted)] mb-1.5"
                  >
                    Confirm New Owner PIN
                  </label>
                  <input
                    id="pin-confirm"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]{4,8}"
                    maxLength={8}
                    required
                    autoComplete="new-password"
                    value={confirmNewPin}
                    onChange={(e) => setConfirmNewPin(e.target.value.replace(/\D/g, ''))}
                    placeholder="Re-enter new PIN"
                    className="w-full h-11 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] font-mono text-sm tracking-[0.28em] text-[var(--yos-text)] placeholder:tracking-normal placeholder:font-sans"
                  />
                </div>

                <button
                  type="submit"
                  disabled={pinUpdating}
                  className="h-11 px-6 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-60 cursor-pointer"
                >
                  {pinUpdating ? 'Updating PIN…' : 'Update Owner PIN'}
                </button>
              </form>

              <div className="lg:col-span-5 rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6 flex flex-col justify-between gap-6">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[var(--yos-accent)]">
                    <ShieldCheck className="w-5 h-5" />
                    <h3 className="text-sm font-semibold text-[var(--yos-text)]">
                      Server-Side Security Active
                    </h3>
                  </div>
                  <ul className="space-y-2.5 text-xs text-[var(--yos-text-muted)] leading-relaxed">
                    <li>· PINs are hashed on the server with salted scrypt and never exposed to browsers.</li>
                    <li>· Every stamp addition, reward redemption, and new cycle start requires fresh PIN verification.</li>
                    <li>· Duplicate stamp clicks and rapid double-scans are automatically blocked on the server.</li>
                    <li>· Owner sessions stay strictly in memory and clear immediately upon sign-out.</li>
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={handleOwnerLogout}
                  className="w-full h-11 rounded-xl border border-[var(--yos-danger)]/50 text-[var(--yos-danger)] text-xs font-semibold hover:bg-[var(--yos-danger)]/10 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Log Out of Owner Dashboard</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Mobile Bottom Tab Navigation (strictly compact <= 15% mobile viewport) */}
      <nav
        aria-label="Owner mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-[var(--yos-border)] bg-[var(--yos-surface)]/95 backdrop-blur-md grid grid-cols-4 items-center px-2"
      >
        {(
          [
            { id: 'overview', label: 'Overview', icon: BarChart3 },
            { id: 'customers', label: 'Members', icon: Users },
            { id: 'locations', label: 'Stores', icon: Building2 },
            { id: 'security', label: 'Security', icon: KeyRound },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center h-full min-w-[44px] ${
                active ? 'text-[var(--yos-accent)]' : 'text-[var(--yos-text-muted)]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium mt-1">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Camera QR Scanner Modal */}
      {scannerOpen && dashboard && (
        <QrScannerModal
          ownerToken={ownerToken}
          stores={dashboard.stores}
          defaultStoreId={storeFilter}
          onClose={() => setScannerOpen(false)}
          onStampSuccess={() => void fetchDashboard()}
          onToast={onToast}
        />
      )}

      {/* Customer Detail Drawer */}
      {drawerCustomer && (
        <CustomerDetailDrawer
          ownerToken={ownerToken}
          customerId={drawerCustomer.id}
          initialStoreId={drawerCustomer.storeId}
          onClose={() => setDrawerCustomer(null)}
          onMutated={() => void fetchDashboard()}
          onToast={onToast}
        />
      )}
    </div>
  );
}
