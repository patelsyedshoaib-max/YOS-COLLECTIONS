import {
  Award,
  Check,
  Clock,
  Copy,
  History,
  LogOut,
  MapPin,
  Maximize2,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  UserPlus,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, formatDateTime, formatShortDate } from '../lib/api';
import type {
  CustomerBundle,
  StoreLocation,
  StoreStampCard,
  ToastMessage,
} from '../types/loyalty';
import { HangerIcon, YosStampSlot } from './BrandMark';

interface CustomerPortalProps {
  stores: StoreLocation[];
  rewardText: string;
  bundle: CustomerBundle | null;
  preferredStoreId: string | null;
  onBundleLoaded: (bundle: CustomerBundle) => void;
  onClearSession: () => void;
  onToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

const CELEBRATION_IMAGE = '/src/assets/images/yos_reward_celebration_1795604445645.jpg';

export function CustomerPortal({
  stores,
  rewardText,
  bundle,
  preferredStoreId,
  onBundleLoaded,
  onClearSession,
  onToast,
}: CustomerPortalProps) {
  const [authTab, setAuthTab] = useState<'register' | 'lookup'>('register');
  const [fullName, setFullName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [homeStoreId, setHomeStoreId] = useState(
    preferredStoreId || stores[0]?.id || ''
  );
  const [lookupQuery, setLookupQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [historyTab, setHistoryTab] = useState<'activity' | 'cycles'>('activity');
  const [historyScope, setHistoryScope] = useState<'branch' | 'all'>('branch');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [celebrationCard, setCelebrationCard] = useState<StoreStampCard | null>(null);
  const [celebrationImgFailed, setCelebrationImgFailed] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [animatedStampKey, setAnimatedStampKey] = useState<string | null>(null);

  const prevStampCountsRef = useRef<Record<string, number>>({});
  const celebratedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!homeStoreId && stores.length > 0) {
      setHomeStoreId(preferredStoreId || stores[0].id);
    }
  }, [stores, preferredStoreId, homeStoreId]);

  useEffect(() => {
    if (!bundle || bundle.cards.length === 0) return;
    setSelectedStoreId((current) => {
      if (current && bundle.cards.some((c) => c.storeId === current)) {
        return current;
      }
      if (preferredStoreId && bundle.cards.some((c) => c.storeId === preferredStoreId)) {
        return preferredStoreId;
      }
      if (
        bundle.customer.homeStoreId &&
        bundle.cards.some((c) => c.storeId === bundle.customer.homeStoreId)
      ) {
        return bundle.customer.homeStoreId;
      }
      return bundle.cards[0].storeId;
    });
  }, [bundle, preferredStoreId]);

  // Detect live stamp increases and 6/6 completions across devices
  useEffect(() => {
    if (!bundle) return;
    const prevMap = prevStampCountsRef.current;

    for (const card of bundle.cards) {
      const prevCount = prevMap[card.storeId];
      if (typeof prevCount === 'number' && card.currentStamps > prevCount) {
        setAnimatedStampKey(`${card.storeId}-${card.cycleNumber}-${card.currentStamps}`);
        if (card.currentStamps === 6) {
          const celKey = `${card.storeId}-${card.cycleNumber}`;
          celebratedKeysRef.current.add(celKey);
          setSelectedStoreId(card.storeId);
          setCelebrationCard(card);
        }
      } else if (
        typeof prevCount === 'undefined' &&
        card.status === 'completed' &&
        card.currentStamps === 6
      ) {
        const celKey = `${card.storeId}-${card.cycleNumber}`;
        if (!celebratedKeysRef.current.has(celKey)) {
          celebratedKeysRef.current.add(celKey);
          setCelebrationCard(card);
        }
      }
      prevMap[card.storeId] = card.currentStamps;
    }
  }, [bundle]);

  const activeCard = useMemo(() => {
    if (!bundle) return null;
    return (
      bundle.cards.find((c) => c.storeId === selectedStoreId) ||
      bundle.cards[0] ||
      null
    );
  }, [bundle, selectedStoreId]);

  const filteredTransactions = useMemo(() => {
    if (!bundle) return [];
    if (historyScope === 'all' || !activeCard) return bundle.transactions;
    return bundle.transactions.filter((tx) => tx.storeId === activeCard.storeId);
  }, [bundle, historyScope, activeCard]);

  const filteredCycles = useMemo(() => {
    if (!bundle) return [];
    if (historyScope === 'all' || !activeCard) return bundle.completedCycles;
    return bundle.completedCycles.filter((c) => c.storeId === activeCard.storeId);
  }, [bundle, historyScope, activeCard]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const created = await api.registerCustomer({
        fullName,
        mobileNumber,
        homeStoreId: homeStoreId || undefined,
      });
      onBundleLoaded(created);
      setFullName('');
      setMobileNumber('');
      onToast({
        type: 'success',
        title: 'Digital Stamp Card Created',
        description: `Welcome to YOS COLLECTION, ${created.customer.fullName}. Your ID is ${created.customer.id}.`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.existingCustomerId) {
        setFormError(err.message);
        setLookupQuery(mobileNumber);
      } else {
        setFormError(err instanceof Error ? err.message : 'Registration failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const found = await api.lookupCustomer(lookupQuery);
      onBundleLoaded(found);
      setLookupQuery('');
      onToast({
        type: 'info',
        title: 'Card Loaded',
        description: `Welcome back, ${found.customer.fullName}.`,
      });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to locate customer card.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleManualRefresh = async () => {
    if (!bundle || refreshing) return;
    setRefreshing(true);
    try {
      const updated = await api.getCustomerCard(bundle.customer.id);
      onBundleLoaded(updated);
    } catch (err) {
      onToast({
        type: 'error',
        title: 'Refresh Failed',
        description: err instanceof Error ? err.message : 'Could not sync your card.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleCopyId = async () => {
    if (!bundle) return;
    try {
      await navigator.clipboard.writeText(bundle.customer.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 1800);
    } catch {
      onToast({
        type: 'info',
        title: 'Customer ID',
        description: bundle.customer.id,
      });
    }
  };

  // ==================== REGISTRATION & LOOKUP GATE ====================
  if (!bundle) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left editorial intro */}
          <div className="lg:col-span-5 space-y-6">
            <div className="flex items-center gap-2.5 text-xs text-[var(--yos-text-muted)]">
              <HangerIcon className="w-5 h-5 text-[var(--yos-accent)]" />
              <span>YOS COLLECTION · Member Loyalty Card</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl font-medium leading-[1.08] text-[var(--yos-text)]">
              Your personal boutique stamp card.
            </h1>

            <p className="text-sm sm:text-base text-[var(--yos-text-muted)] leading-relaxed">
              Register in seconds with your full name and mobile number to generate your
              unique Customer ID and QR code. Collect 6 gold hanger stamps per boutique
              location to unlock{' '}
              <span className="text-[var(--yos-text)] font-medium">{rewardText}</span>.
            </p>

            <div className="pt-6 border-t border-[var(--yos-border)] space-y-3 text-xs text-[var(--yos-text-muted)]">
              <p>01 · One permanent QR code works across every YOS COLLECTION store.</p>
              <p>02 · Separate 6-stamp progress and rewards tracked per boutique branch.</p>
              <p>03 · Live synchronized updates when the store owner stamps your purchase.</p>
            </div>
          </div>

          {/* Right Form Container */}
          <div className="lg:col-span-7 rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6 sm:p-8">
            {/* Segmented Mode Control */}
            <div
              role="tablist"
              aria-label="Customer account mode"
              className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--yos-surface-alt)] border border-[var(--yos-border)] mb-7"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'register'}
                onClick={() => {
                  setAuthTab('register');
                  setFormError(null);
                }}
                className={`py-2.5 px-3 min-h-[44px] rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  authTab === 'register'
                    ? 'bg-[var(--yos-surface)] text-[var(--yos-text)] shadow-xs border border-[var(--yos-border-strong)]'
                    : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                }`}
              >
                Create Customer Account
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'lookup'}
                onClick={() => {
                  setAuthTab('lookup');
                  setFormError(null);
                }}
                className={`py-2.5 px-3 min-h-[44px] rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                  authTab === 'lookup'
                    ? 'bg-[var(--yos-surface)] text-[var(--yos-text)] shadow-xs border border-[var(--yos-border-strong)]'
                    : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                }`}
              >
                Open Existing Card
              </button>
            </div>

            {formError && (
              <div
                role="alert"
                className="mb-6 rounded-xl border border-[var(--yos-danger)]/40 bg-[var(--yos-danger)]/10 px-4 py-3 text-xs sm:text-sm text-[var(--yos-text)] flex flex-col gap-2"
              >
                <span>{formError}</span>
                {authTab === 'register' && formError.includes('already exists') && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthTab('lookup');
                      setFormError(null);
                    }}
                    className="self-start text-xs font-semibold text-[var(--yos-accent)] underline underline-offset-4 cursor-pointer"
                  >
                    Switch to Open Existing Card
                  </button>
                )}
              </div>
            )}

            {authTab === 'register' ? (
              <form onSubmit={handleRegister} className="space-y-5">
                <div>
                  <label
                    htmlFor="yos-full-name"
                    className="block text-xs font-medium text-[var(--yos-text-muted)] mb-2"
                  >
                    Full Name
                  </label>
                  <input
                    id="yos-full-name"
                    type="text"
                    required
                    minLength={2}
                    maxLength={80}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g., Amira Laurent"
                    className="w-full h-12 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)] placeholder:text-[var(--yos-text-muted)]/60 focus:border-[var(--yos-accent)] transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="yos-mobile"
                    className="block text-xs font-medium text-[var(--yos-text-muted)] mb-2"
                  >
                    Mobile Number
                  </label>
                  <input
                    id="yos-mobile"
                    type="tel"
                    required
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="e.g., +1 555 019 4820"
                    className="w-full h-12 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm font-mono text-[var(--yos-text)] placeholder:font-sans placeholder:text-[var(--yos-text-muted)]/60 focus:border-[var(--yos-accent)] transition-colors"
                  />
                </div>

                {stores.length > 0 && (
                  <div>
                    <label
                      htmlFor="yos-home-store"
                      className="block text-xs font-medium text-[var(--yos-text-muted)] mb-2"
                    >
                      Primary Boutique Location
                    </label>
                    <select
                      id="yos-home-store"
                      value={homeStoreId}
                      onChange={(e) => setHomeStoreId(e.target.value)}
                      className="w-full h-12 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)] focus:border-[var(--yos-accent)] transition-colors"
                    >
                      {stores.map((store) => (
                        <option key={store.id} value={store.id}>
                          {store.name} — {store.location}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-sm font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{submitting ? 'Generating Your Card…' : 'Create Customer Account'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={handleLookup} className="space-y-5">
                <div>
                  <label
                    htmlFor="yos-lookup"
                    className="block text-xs font-medium text-[var(--yos-text-muted)] mb-2"
                  >
                    Registered Mobile Number or Customer ID
                  </label>
                  <input
                    id="yos-lookup"
                    type="text"
                    required
                    value={lookupQuery}
                    onChange={(e) => setLookupQuery(e.target.value)}
                    placeholder="Enter mobile number or YOS-XXXXXX"
                    className="w-full h-12 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm font-mono text-[var(--yos-text)] placeholder:font-sans placeholder:text-[var(--yos-text-muted)]/60 focus:border-[var(--yos-accent)] transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full h-12 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-sm font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-60 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <QrCode className="w-4 h-4" />
                  <span>{submitting ? 'Locating Membership…' : 'Open My Digital Stamp Card'}</span>
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==================== DIGITAL STAMP CARD VIEW ====================
  const progressPercent = activeCard ? Math.round((activeCard.currentStamps / 6) * 100) : 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 pb-24">
      {/* Top Customer Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[var(--yos-border)]">
        <div>
          <p className="text-xs text-[var(--yos-text-muted)]">
            YOS COLLECTION Member · Synced Across Devices
          </p>
          <h1 className="font-display text-3xl sm:text-4xl font-medium text-[var(--yos-text)] mt-1">
            {bundle.customer.fullName}
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border border-[var(--yos-border)] bg-[var(--yos-surface)] text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-border-strong)] transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Sync</span>
          </button>
          <button
            type="button"
            onClick={onClearSession}
            className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border border-[var(--yos-border)] bg-[var(--yos-surface)] text-xs font-medium text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] hover:border-[var(--yos-border-strong)] transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Switch Account</span>
          </button>
        </div>
      </div>

      {/* Disabled Account Warning */}
      {bundle.customer.isBlocked && (
        <div
          role="alert"
          className="mt-6 rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-4 flex items-start gap-3"
        >
          <ShieldAlert className="w-5 h-5 text-[var(--yos-danger)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-[var(--yos-text)]">
              Account Currently Suspended
            </p>
            <p className="text-xs text-[var(--yos-text-muted)] mt-1">
              New stamps cannot be added while this loyalty card is disabled. Please speak
              with a YOS COLLECTION boutique manager for assistance.
            </p>
          </div>
        </div>
      )}

      {/* Multi-Store Location Selector Tabs */}
      <div className="mt-7">
        <div className="flex items-center justify-between gap-4 mb-3">
          <p className="text-xs font-medium text-[var(--yos-text-muted)]">
            Select Boutique Location · Separate 6-Stamp Card Per Branch
          </p>
          <span className="font-mono text-xs text-[var(--yos-text-muted)] tabular-nums">
            {bundle.cards.length} Locations
          </span>
        </div>

        <div
          role="tablist"
          aria-label="Boutique location stamp cards"
          className="flex items-center gap-2 overflow-x-auto pb-2"
        >
          {bundle.cards.map((card) => {
            const isSelected = activeCard?.storeId === card.storeId;
            return (
              <button
                key={card.storeId}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedStoreId(card.storeId)}
                className={`flex items-center gap-3 px-4 py-3 min-h-[48px] rounded-xl border text-left transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isSelected
                    ? 'border-[var(--yos-accent)] bg-[var(--yos-surface)] text-[var(--yos-text)]'
                    : 'border-[var(--yos-border)] bg-[var(--yos-surface)]/45 text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] hover:border-[var(--yos-border-strong)]'
                }`}
              >
                <MapPin
                  className={`w-4 h-4 shrink-0 ${
                    isSelected ? 'text-[var(--yos-accent)]' : 'text-[var(--yos-text-muted)]'
                  }`}
                />
                <span className="text-sm font-medium">{card.storeName}</span>
                <span className="font-mono text-xs tabular-nums opacity-80">
                  {card.currentStamps}/6
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Responsive Two-Column Grid: Digital Card Left (7 cols), QR & History Right (5 cols) */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Focal Digital Loyalty Stamp Card */}
        <div className="lg:col-span-7 space-y-6">
          {activeCard && (
            <div className="rounded-2xl border border-[var(--yos-card-border)] bg-[var(--yos-card-bg)] yos-card-sheen p-6 sm:p-8 shadow-[0_18px_50px_rgba(0,0,0,0.22)]">
              {/* Card Brand Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-6 border-b border-[var(--yos-border)]">
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-full border border-[var(--yos-card-border)] bg-[var(--yos-surface-alt)] flex items-center justify-center shrink-0">
                    <HangerIcon className="w-6 h-6 text-[var(--yos-accent)]" />
                  </div>
                  <div>
                    <p className="font-display text-2xl font-semibold tracking-[0.16em] text-[var(--yos-text)] leading-none">
                      YOS COLLECTION
                    </p>
                    <p className="text-xs text-[var(--yos-text-muted)] mt-1.5">
                      {activeCard.storeName} · {activeCard.storeLocation}
                    </p>
                  </div>
                </div>

                <div className="sm:text-right">
                  <p className="font-mono text-xs text-[var(--yos-accent)] tabular-nums">
                    Cycle {String(activeCard.cycleNumber).padStart(2, '0')}
                  </p>
                  <p className="font-mono text-xs text-[var(--yos-text-muted)] mt-1 tabular-nums">
                    {bundle.customer.id}
                  </p>
                </div>
              </div>

              {/* Customer Details Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-5 border-b border-[var(--yos-border)]">
                <div>
                  <p className="text-xs text-[var(--yos-text-muted)]">Cardholder</p>
                  <p className="text-base font-semibold text-[var(--yos-text)] mt-0.5">
                    {bundle.customer.fullName}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs text-[var(--yos-text-muted)]">Unique Customer ID</p>
                  <div className="inline-flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-sm font-medium text-[var(--yos-text)] tabular-nums">
                      {bundle.customer.id}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      aria-label="Copy Customer ID"
                      className="p-1.5 rounded-md text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] hover:bg-[var(--yos-surface-alt)] transition-colors cursor-pointer"
                    >
                      {copiedId ? (
                        <Check className="w-3.5 h-3.5 text-[var(--yos-success)]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* 6 Circular Digital Stamp Slots */}
              <div className="py-8">
                <div className="grid grid-cols-3 gap-y-6 gap-x-4 justify-items-center">
                  {[1, 2, 3, 4, 5, 6].map((slotIndex) => {
                    const filled = slotIndex <= activeCard.currentStamps;
                    const stampKey = `${activeCard.storeId}-${activeCard.cycleNumber}-${slotIndex}`;
                    return (
                      <YosStampSlot
                        key={slotIndex}
                        index={slotIndex}
                        filled={filled}
                        isNewest={animatedStampKey === stampKey}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Progress Counter, Bar & Reward Status */}
              <div className="pt-6 border-t border-[var(--yos-border)] space-y-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-mono text-lg font-semibold text-[var(--yos-text)] tabular-nums">
                    {activeCard.currentStamps}/6 Stamps
                  </span>
                  <span className="text-xs font-medium text-[var(--yos-text-muted)]">
                    {activeCard.status === 'completed'
                      ? 'Completed · Ready to Redeem'
                      : activeCard.status === 'redeemed'
                      ? 'Reward Redeemed · Awaiting Next Cycle'
                      : `${6 - activeCard.currentStamps} ${
                          6 - activeCard.currentStamps === 1 ? 'stamp' : 'stamps'
                        } remaining`}
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  role="progressbar"
                  aria-valuenow={activeCard.currentStamps}
                  aria-valuemin={0}
                  aria-valuemax={6}
                  aria-label="Stamp card progress"
                  className="h-2 w-full rounded-full bg-[var(--yos-surface-alt)] overflow-hidden"
                >
                  <motion.div
                    initial={false}
                    animate={{ width: `${progressPercent}%` }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="h-full rounded-full yos-gold-foil"
                  />
                </div>

                {/* Reward Offer Status */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--yos-text-muted)]">6-Stamp Reward</p>
                    <p className="text-sm font-semibold text-[var(--yos-text)] mt-0.5">
                      {activeCard.rewardText}
                    </p>
                  </div>

                  {activeCard.currentStamps === 6 && (
                    <button
                      type="button"
                      onClick={() => setCelebrationCard(activeCard)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Award className="w-4 h-4" />
                      <span>View Completed Reward</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[var(--yos-text-muted)] pt-2 border-t border-[var(--yos-border)]/70">
                  Only authorized YOS COLLECTION store owners can issue stamps after
                  scanning your QR code and entering the Owner PIN.
                </p>
              </div>
            </div>
          )}

          {/* Lifetime Member Summary Row */}
          <div className="grid grid-cols-3 gap-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-5">
            <div>
              <p className="text-xs text-[var(--yos-text-muted)]">Branch Total</p>
              <p className="font-mono text-xl font-semibold text-[var(--yos-text)] tabular-nums mt-1">
                {activeCard?.totalStampsEarned ?? 0}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--yos-text-muted)]">Cycles Finished</p>
              <p className="font-mono text-xl font-semibold text-[var(--yos-text)] tabular-nums mt-1">
                {bundle.completedCycles.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--yos-text-muted)]">Member Since</p>
              <p className="font-mono text-sm font-medium text-[var(--yos-text)] tabular-nums mt-2">
                {formatShortDate(bundle.customer.createdAt)}
              </p>
            </div>
          </div>
        </div>

        {/* Right: Scannable QR Presentation & Stamp History */}
        <div className="lg:col-span-5 space-y-6">
          {/* Personal QR Code Card */}
          <div className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6">
            <div className="flex items-center justify-between gap-3 mb-5">
              <div>
                <h2 className="font-display text-2xl font-medium text-[var(--yos-text)]">
                  Checkout QR Pass
                </h2>
                <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                  Present this code to the store owner at checkout
                </p>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(true)}
                aria-label="Expand QR code for scanning"
                className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-[var(--yos-border)] text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-accent)] transition-colors cursor-pointer"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expand</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setQrModalOpen(true)}
              className="w-full rounded-xl bg-white p-6 flex flex-col items-center justify-center border border-[#e3dfd5] cursor-pointer hover:opacity-95 transition-opacity"
            >
              <QRCodeSVG
                value={bundle.customer.qrCodeValue}
                size={188}
                level="H"
                fgColor="#0c0c0e"
                bgColor="#ffffff"
              />
              <p className="font-mono text-sm font-semibold tracking-[0.14em] text-[#111112] mt-4 tabular-nums">
                {bundle.customer.id}
              </p>
              <p className="text-[11px] text-[#555148] mt-1">
                {bundle.customer.fullName} · Tap for bright checkout screen
              </p>
            </button>
          </div>

          {/* Stamp & Completed Cycle History */}
          <div className="rounded-2xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--yos-border)]">
              <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--yos-surface-alt)] border border-[var(--yos-border)]">
                <button
                  type="button"
                  onClick={() => setHistoryTab('activity')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    historyTab === 'activity'
                      ? 'bg-[var(--yos-surface)] text-[var(--yos-text)]'
                      : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                  }`}
                >
                  Stamp History
                </button>
                <button
                  type="button"
                  onClick={() => setHistoryTab('cycles')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                    historyTab === 'cycles'
                      ? 'bg-[var(--yos-surface)] text-[var(--yos-text)]'
                      : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                  }`}
                >
                  Completed Cycles ({filteredCycles.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() =>
                  setHistoryScope((prev) => (prev === 'branch' ? 'all' : 'branch'))
                }
                className="text-xs font-medium text-[var(--yos-accent)] hover:underline underline-offset-4 cursor-pointer"
              >
                {historyScope === 'branch' ? 'Show All Stores' : 'Current Store Only'}
              </button>
            </div>

            {historyTab === 'activity' ? (
              filteredTransactions.length === 0 ? (
                <div className="py-10 text-center">
                  <History className="w-7 h-7 text-[var(--yos-text-muted)] mx-auto opacity-50" />
                  <p className="text-sm font-medium text-[var(--yos-text)] mt-3">
                    No stamps recorded yet
                  </p>
                  <p className="text-xs text-[var(--yos-text-muted)] mt-1">
                    Present your QR pass on your next purchase to collect your first gold
                    hanger stamp.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-[var(--yos-border)] max-h-[360px] overflow-y-auto mt-2">
                  {filteredTransactions.map((tx) => (
                    <li key={tx.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--yos-text)]">
                          {tx.actionType === 'stamp_added' &&
                            `Stamp ${tx.stampNumber}/6 Added`}
                          {tx.actionType === 'card_completed' && '6-Stamp Card Completed'}
                          {tx.actionType === 'reward_redeemed' && 'Reward Redeemed'}
                          {tx.actionType === 'cycle_started' &&
                            `Started Cycle ${tx.cycleNumber}`}
                        </p>
                        <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                          {tx.storeName} · Cycle {tx.cycleNumber}
                          {tx.note ? ` · ${tx.note}` : ''}
                        </p>
                      </div>
                      <span className="font-mono text-[11px] text-[var(--yos-text-muted)] tabular-nums shrink-0 text-right">
                        {formatDateTime(tx.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            ) : filteredCycles.length === 0 ? (
              <div className="py-10 text-center">
                <Award className="w-7 h-7 text-[var(--yos-text-muted)] mx-auto opacity-50" />
                <p className="text-sm font-medium text-[var(--yos-text)] mt-3">
                  No completed cycles yet
                </p>
                <p className="text-xs text-[var(--yos-text-muted)] mt-1">
                  Every finished 6-stamp card is permanently archived here with its reward
                  and redemption timestamp.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[var(--yos-border)] max-h-[360px] overflow-y-auto mt-2">
                {filteredCycles.map((cycle) => (
                  <li key={cycle.id} className="py-4 space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-[var(--yos-text)]">
                        {cycle.storeName} · Cycle {cycle.cycleNumber}
                      </p>
                      <span className="font-mono text-xs text-[var(--yos-accent)] tabular-nums">
                        6/6 Stamps
                      </span>
                    </div>
                    <p className="text-xs text-[var(--yos-text)]">{cycle.rewardText}</p>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--yos-text-muted)]">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Completed {formatDateTime(cycle.completedAt)}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          cycle.redeemedAt
                            ? 'text-[var(--yos-success)] font-medium'
                            : 'text-[var(--yos-warning)] font-medium'
                        }
                      >
                        {cycle.redeemedAt
                          ? `Redeemed ${formatShortDate(cycle.redeemedAt)}`
                          : 'Awaiting Redemption'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen High-Contrast Checkout QR Modal */}
      <AnimatePresence>
        {qrModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setQrModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white text-[#111112] p-7 text-center relative shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                aria-label="Close QR modal"
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#f4f2ec] text-[#111112] flex items-center justify-center cursor-pointer hover:bg-[#e8e4da]"
              >
                <X className="w-5 h-5" />
              </button>

              <p className="font-display text-2xl font-semibold tracking-[0.18em] text-[#111112]">
                YOS COLLECTION
              </p>
              <p className="text-xs text-[#666055] mt-1">
                {activeCard?.storeName || 'Member Pass'}
              </p>

              <div className="my-6 flex justify-center">
                <QRCodeSVG
                  value={bundle.customer.qrCodeValue}
                  size={240}
                  level="H"
                  fgColor="#0a0a0b"
                  bgColor="#ffffff"
                />
              </div>

              <p className="font-mono text-lg font-bold tracking-[0.16em] text-[#111112] tabular-nums">
                {bundle.customer.id}
              </p>
              <p className="text-sm font-medium text-[#3b372f] mt-1">
                {bundle.customer.fullName}
              </p>
              <p className="text-xs text-[#6d675c] mt-3">
                Show this screen to our store owner to receive your verified purchase stamp.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6/6 Completion Celebration Modal */}
      <AnimatePresence>
        {celebrationCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setCelebrationCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 18 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-2xl border border-[var(--yos-card-border)] bg-[var(--yos-surface)] overflow-hidden shadow-2xl"
            >
              <div className="relative h-44 bg-[#14110b] overflow-hidden">
                {!celebrationImgFailed ? (
                  <img
                    src={CELEBRATION_IMAGE}
                    alt="YOS COLLECTION signature black gift box tied with a champagne gold ribbon"
                    referrerPolicy="no-referrer"
                    onError={() => setCelebrationImgFailed(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <HangerIcon className="w-16 h-16 text-[#d6b162]" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex items-end p-6">
                  <div className="flex items-center gap-2 text-[#f0d799]">
                    <Sparkles className="w-4 h-4" />
                    <span className="font-mono text-xs tracking-[0.14em]">
                      6 / 6 STAMPS COMPLETED · {celebrationCard.storeName.toUpperCase()}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCelebrationCard(null)}
                  aria-label="Close celebration popup"
                  className="absolute top-3.5 right-3.5 w-10 h-10 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 sm:p-7 space-y-5">
                <div>
                  <h2 className="font-display text-3xl font-semibold text-[var(--yos-text)] leading-tight">
                    Congratulations! You have completed your 6 stamps!
                  </h2>
                  <p className="text-sm text-[var(--yos-text-muted)] mt-2 leading-relaxed">
                    Your Cycle {celebrationCard.cycleNumber} card at{' '}
                    <span className="text-[var(--yos-text)] font-medium">
                      {celebrationCard.storeName}
                    </span>{' '}
                    is complete. Present your QR code to the store owner to redeem your
                    reward and begin your next cycle.
                  </p>
                </div>

                <div className="rounded-xl border border-[var(--yos-card-border)] bg-[var(--yos-surface-alt)]/65 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-[var(--yos-text-muted)]">Unlocked Privilege</p>
                    <p className="text-base font-semibold text-[var(--yos-text)] mt-0.5">
                      {celebrationCard.rewardText}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-[var(--yos-accent)] tabular-nums shrink-0">
                    {celebrationCard.status === 'redeemed' ? 'Redeemed' : 'Ready'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCelebrationCard(null);
                      setQrModalOpen(true);
                    }}
                    className="px-5 py-2.5 min-h-[44px] rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] transition-colors cursor-pointer"
                  >
                    Show QR at Checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => setCelebrationCard(null)}
                    className="px-5 py-2.5 min-h-[44px] rounded-lg border border-[var(--yos-border)] text-xs font-medium text-[var(--yos-text)] hover:bg-[var(--yos-surface-alt)] transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
