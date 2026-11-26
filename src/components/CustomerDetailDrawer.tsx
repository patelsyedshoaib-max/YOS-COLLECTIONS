import {
  AlertCircle,
  Award,
  Ban,
  CheckCircle2,
  Edit3,
  KeyRound,
  RotateCcw,
  Save,
  ShieldCheck,
  Stamp,
  X,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import React, { useEffect, useState } from 'react';
import { api, formatDateTime, formatShortDate } from '../lib/api';
import type { CustomerBundle, ToastMessage } from '../types/loyalty';
import { YosStampSlot } from './BrandMark';

interface CustomerDetailDrawerProps {
  ownerToken: string;
  customerId: string;
  initialStoreId?: string;
  onClose: () => void;
  onMutated: () => void;
  onToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function CustomerDetailDrawer({
  ownerToken,
  customerId,
  initialStoreId,
  onClose,
  onMutated,
  onToast,
}: CustomerDetailDrawerProps) {
  const [bundle, setBundle] = useState<CustomerBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState(initialStoreId || '');

  // Edit profile state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);

  // PIN-protected stamp/reward/cycle state
  const [ownerPin, setOwnerPin] = useState('');
  const [stampNote, setStampNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyTab, setHistoryTab] = useState<'transactions' | 'cycles'>('transactions');

  const fetchCustomer = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await api.ownerLookupCustomer(ownerToken, customerId);
      setBundle(data);
      setEditName(data.customer.fullName);
      setEditMobile(data.customer.mobileNumber);
      setSelectedStoreId((prev) => {
        if (prev && data.cards.some((c) => c.storeId === prev)) return prev;
        if (initialStoreId && data.cards.some((c) => c.storeId === initialStoreId)) {
          return initialStoreId;
        }
        return data.cards[0]?.storeId || '';
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Unable to load customer profile.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchCustomer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const activeCard = bundle?.cards.find((c) => c.storeId === selectedStoreId) || bundle?.cards[0] || null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundle) return;
    setProfileSaving(true);
    setActionError(null);
    try {
      const res = await api.ownerUpdateCustomer(ownerToken, bundle.customer.id, {
        fullName: editName,
        mobileNumber: editMobile,
      });
      setBundle(res.bundle);
      setEditingProfile(false);
      onToast({
        type: 'success',
        title: 'Customer Updated',
        description: `Saved profile changes for ${res.bundle.customer.fullName}.`,
      });
      onMutated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update customer.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleToggleBlock = async () => {
    if (!bundle) return;
    setProfileSaving(true);
    setActionError(null);
    try {
      const nextBlocked = !bundle.customer.isBlocked;
      const res = await api.ownerUpdateCustomer(ownerToken, bundle.customer.id, {
        isBlocked: nextBlocked,
      });
      setBundle(res.bundle);
      onToast({
        type: nextBlocked ? 'info' : 'success',
        title: nextBlocked ? 'Customer Account Disabled' : 'Customer Account Re-Enabled',
        description: `${res.bundle.customer.fullName} (${res.bundle.customer.id})`,
      });
      onMutated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to change account status.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAddStamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bundle || !activeCard || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const key = `drawer-${bundle.customer.id}-${activeCard.storeId}-${Date.now()}`;
      const res = await api.ownerAddStamp(ownerToken, {
        customerId: bundle.customer.id,
        storeId: activeCard.storeId,
        pin: ownerPin,
        idempotencyKey: key,
        note: stampNote.trim() || undefined,
      });
      setBundle(res.bundle);
      setOwnerPin('');
      setStampNote('');
      onToast({
        type: 'success',
        title: res.completed ? '6/6 Card Completed!' : `Stamp ${res.stampNumber}/6 Added`,
        description: `${bundle.customer.fullName} · ${res.storeName}`,
      });
      onMutated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to authorize stamp.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!bundle || !activeCard || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await api.ownerRedeemReward(ownerToken, {
        customerId: bundle.customer.id,
        storeId: activeCard.storeId,
        pin: ownerPin,
      });
      setBundle(res.bundle);
      setOwnerPin('');
      onToast({
        type: 'success',
        title: 'Reward Marked Redeemed',
        description: `${bundle.customer.fullName} · ${activeCard.storeName}`,
      });
      onMutated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to redeem reward.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartNewCycle = async () => {
    if (!bundle || !activeCard || actionLoading) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await api.ownerStartNewCycle(ownerToken, {
        customerId: bundle.customer.id,
        storeId: activeCard.storeId,
        pin: ownerPin,
      });
      setBundle(res.bundle);
      setOwnerPin('');
      onToast({
        type: 'success',
        title: `Started Cycle ${res.cycleNumber}`,
        description: `Previous 6-stamp card archived for ${bundle.customer.fullName}.`,
      });
      onMutated();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to start new cycle.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex justify-end"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Customer Loyalty Profile"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-[var(--yos-surface)] border-l border-[var(--yos-border-strong)] flex flex-col shadow-2xl"
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-[var(--yos-border)] flex items-center justify-between gap-4 shrink-0">
          <div>
            <p className="font-mono text-xs text-[var(--yos-accent)] tabular-nums">
              {customerId}
            </p>
            <h2 className="font-display text-2xl font-medium text-[var(--yos-text)]">
              {bundle?.customer.fullName || 'Customer Profile'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customer drawer"
            className="w-10 h-10 rounded-lg border border-[var(--yos-border)] flex items-center justify-center text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-7">
          {loading ? (
            <div className="space-y-4">
              <div className="h-24 rounded-xl bg-[var(--yos-surface-alt)] animate-pulse" />
              <div className="h-44 rounded-xl bg-[var(--yos-surface-alt)] animate-pulse" />
              <div className="h-36 rounded-xl bg-[var(--yos-surface-alt)] animate-pulse" />
            </div>
          ) : loadError || !bundle ? (
            <div className="rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-5 text-sm text-[var(--yos-text)]">
              {loadError || 'Unable to load customer record.'}
            </div>
          ) : (
            <>
              {/* Profile & Account Controls */}
              <div className="rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-lg bg-white border border-[#dedad0] shrink-0">
                      <QRCodeSVG
                        value={bundle.customer.qrCodeValue}
                        size={72}
                        level="M"
                        fgColor="#0a0a0b"
                        bgColor="#ffffff"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-semibold text-[var(--yos-text)]">
                        {bundle.customer.fullName}
                      </p>
                      <p className="font-mono text-xs text-[var(--yos-text-muted)] tabular-nums">
                        {bundle.customer.mobileNumber} · {bundle.customer.id}
                      </p>
                      <p className="text-xs text-[var(--yos-text-muted)]">
                        Joined {formatShortDate(bundle.customer.createdAt)} ·{' '}
                        <span
                          className={
                            bundle.customer.isBlocked
                              ? 'text-[var(--yos-danger)] font-semibold'
                              : 'text-[var(--yos-success)] font-medium'
                          }
                        >
                          {bundle.customer.isBlocked ? 'Disabled / Blocked' : 'Active Member'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditingProfile((v) => !v)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-[var(--yos-border)] text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-border-strong)] cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>{editingProfile ? 'Cancel' : 'Edit Info'}</span>
                    </button>
                    <button
                      type="button"
                      disabled={profileSaving}
                      onClick={handleToggleBlock}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                        bundle.customer.isBlocked
                          ? 'border-[var(--yos-success)]/50 text-[var(--yos-success)] hover:bg-[var(--yos-success)]/10'
                          : 'border-[var(--yos-danger)]/50 text-[var(--yos-danger)] hover:bg-[var(--yos-danger)]/10'
                      }`}
                    >
                      {bundle.customer.isBlocked ? (
                        <>
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Unblock</span>
                        </>
                      ) : (
                        <>
                          <Ban className="w-3.5 h-3.5" />
                          <span>Disable Account</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {editingProfile && (
                  <form
                    onSubmit={handleSaveProfile}
                    className="mt-5 pt-5 border-t border-[var(--yos-border)] grid grid-cols-1 sm:grid-cols-2 gap-4"
                  >
                    <div>
                      <label
                        htmlFor="edit-cust-name"
                        className="block text-xs text-[var(--yos-text-muted)] mb-1.5"
                      >
                        Full Name
                      </label>
                      <input
                        id="edit-cust-name"
                        type="text"
                        required
                        minLength={2}
                        maxLength={80}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-surface)] text-sm text-[var(--yos-text)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="edit-cust-mobile"
                        className="block text-xs text-[var(--yos-text-muted)] mb-1.5"
                      >
                        Mobile Number
                      </label>
                      <input
                        id="edit-cust-mobile"
                        type="tel"
                        required
                        value={editMobile}
                        onChange={(e) => setEditMobile(e.target.value)}
                        className="w-full h-10 px-3 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-surface)] text-sm font-mono text-[var(--yos-text)]"
                      />
                    </div>
                    <div className="sm:col-span-2 flex justify-end">
                      <button
                        type="submit"
                        disabled={profileSaving}
                        className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{profileSaving ? 'Saving…' : 'Save Changes'}</span>
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Per-Store Stamp Card Switcher */}
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-[var(--yos-text-muted)]">
                    Boutique Location Cards
                  </h3>
                  <span className="font-mono text-xs text-[var(--yos-text-muted)] tabular-nums">
                    {bundle.cards.length} Branches
                  </span>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {bundle.cards.map((card) => {
                    const active = card.storeId === activeCard?.storeId;
                    return (
                      <button
                        key={card.storeId}
                        type="button"
                        onClick={() => {
                          setSelectedStoreId(card.storeId);
                          setActionError(null);
                        }}
                        className={`px-3.5 py-2.5 min-h-[42px] rounded-lg border text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          active
                            ? 'border-[var(--yos-accent)] bg-[var(--yos-surface-alt)] text-[var(--yos-text)]'
                            : 'border-[var(--yos-border)] text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                        }`}
                      >
                        {card.storeName} ·{' '}
                        <span className="font-mono tabular-nums">{card.currentStamps}/6</span>
                      </button>
                    );
                  })}
                </div>

                {activeCard && (
                  <div className="rounded-xl border border-[var(--yos-card-border)] bg-[var(--yos-card-bg)] p-5 space-y-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-[var(--yos-text)]">
                          {activeCard.storeName} · Cycle {activeCard.cycleNumber}
                        </p>
                        <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                          Reward: {activeCard.rewardText}
                        </p>
                      </div>
                      <span className="font-mono text-sm font-semibold text-[var(--yos-accent)] tabular-nums">
                        {activeCard.currentStamps} / 6
                      </span>
                    </div>

                    <div className="grid grid-cols-6 gap-2 justify-items-center">
                      {[1, 2, 3, 4, 5, 6].map((slot) => (
                        <YosStampSlot
                          key={slot}
                          index={slot}
                          filled={slot <= activeCard.currentStamps}
                          compact
                        />
                      ))}
                    </div>

                    {actionError && (
                      <div
                        role="alert"
                        className="rounded-lg border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-3 text-xs text-[var(--yos-text)] flex items-start gap-2"
                      >
                        <AlertCircle className="w-4 h-4 text-[var(--yos-danger)] shrink-0 mt-0.5" />
                        <span>{actionError}</span>
                      </div>
                    )}

                    {/* PIN-Gated Owner Controls */}
                    {!bundle.customer.isBlocked && (
                      <form
                        onSubmit={handleAddStamp}
                        className="pt-4 border-t border-[var(--yos-border)] space-y-3"
                      >
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label
                              htmlFor="drawer-owner-pin"
                              className="flex items-center gap-1.5 text-xs font-medium text-[var(--yos-text)] mb-1.5"
                            >
                              <KeyRound className="w-3.5 h-3.5 text-[var(--yos-accent)]" />
                              <span>Owner PIN (Required)</span>
                            </label>
                            <input
                              id="drawer-owner-pin"
                              type="password"
                              inputMode="numeric"
                              maxLength={8}
                              autoComplete="off"
                              value={ownerPin}
                              onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                              placeholder="Enter PIN"
                              className="w-full h-11 px-3.5 rounded-lg border border-[var(--yos-border-strong)] bg-[var(--yos-bg)] text-sm font-mono tracking-[0.28em] text-[var(--yos-text)] placeholder:tracking-normal placeholder:font-sans"
                            />
                          </div>

                          {activeCard.status === 'in_progress' && activeCard.currentStamps < 6 && (
                            <div>
                              <label
                                htmlFor="drawer-stamp-note"
                                className="block text-xs text-[var(--yos-text-muted)] mb-1.5"
                              >
                                Purchase Note (Optional)
                              </label>
                              <input
                                id="drawer-stamp-note"
                                type="text"
                                maxLength={140}
                                value={stampNote}
                                onChange={(e) => setStampNote(e.target.value)}
                                placeholder="Receipt or item note"
                                className="w-full h-11 px-3.5 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-bg)] text-xs text-[var(--yos-text)]"
                              />
                            </div>
                          )}
                        </div>

                        {activeCard.status === 'in_progress' && activeCard.currentStamps < 6 ? (
                          <button
                            type="submit"
                            disabled={actionLoading || ownerPin.length < 4}
                            className="w-full h-11 rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-55 inline-flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <Stamp className="w-4 h-4" />
                            <span>
                              {actionLoading
                                ? 'Authorizing…'
                                : `Verify PIN & Add Stamp (${activeCard.currentStamps + 1}/6)`}
                            </span>
                          </button>
                        ) : (
                          <div className="flex flex-col sm:flex-row gap-2.5">
                            {activeCard.status === 'completed' && (
                              <button
                                type="button"
                                onClick={handleRedeem}
                                disabled={actionLoading || ownerPin.length < 4}
                                className="flex-1 h-11 px-4 rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-55 inline-flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <Award className="w-4 h-4" />
                                <span>Mark Reward Redeemed</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={handleStartNewCycle}
                              disabled={actionLoading || ownerPin.length < 4}
                              className="flex-1 h-11 px-4 rounded-lg border border-[var(--yos-accent)] bg-[var(--yos-surface-alt)] text-[var(--yos-text)] text-xs font-semibold hover:bg-[var(--yos-surface)] disabled:opacity-55 inline-flex items-center justify-center gap-2 cursor-pointer"
                            >
                              <RotateCcw className="w-4 h-4 text-[var(--yos-accent)]" />
                              <span>Start Cycle {activeCard.cycleNumber + 1}</span>
                            </button>
                          </div>
                        )}
                      </form>
                    )}
                  </div>
                )}
              </div>

              {/* History & Archived Completed Cycles */}
              <div className="space-y-4">
                <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--yos-surface-alt)] border border-[var(--yos-border)] w-fit">
                  <button
                    type="button"
                    onClick={() => setHistoryTab('transactions')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                      historyTab === 'transactions'
                        ? 'bg-[var(--yos-surface)] text-[var(--yos-text)]'
                        : 'text-[var(--yos-text-muted)]'
                    }`}
                  >
                    Stamp History ({bundle.transactions.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryTab('cycles')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer ${
                      historyTab === 'cycles'
                        ? 'bg-[var(--yos-surface)] text-[var(--yos-text)]'
                        : 'text-[var(--yos-text-muted)]'
                    }`}
                  >
                    Completed Cycles ({bundle.completedCycles.length})
                  </button>
                </div>

                {historyTab === 'transactions' ? (
                  bundle.transactions.length === 0 ? (
                    <p className="text-xs text-[var(--yos-text-muted)] py-4">
                      No stamp transactions recorded for this customer yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-[var(--yos-border)] border-t border-[var(--yos-border)]">
                      {bundle.transactions.map((tx) => (
                        <li
                          key={tx.id}
                          className="py-3 flex items-start justify-between gap-4 text-xs"
                        >
                          <div>
                            <p className="font-medium text-[var(--yos-text)]">
                              {tx.actionType === 'stamp_added' &&
                                `Stamp ${tx.stampNumber}/6 Added`}
                              {tx.actionType === 'card_completed' && 'Card Completed (6/6)'}
                              {tx.actionType === 'reward_redeemed' && 'Reward Redeemed'}
                              {tx.actionType === 'cycle_started' &&
                                `Started Cycle ${tx.cycleNumber}`}
                            </p>
                            <p className="text-[var(--yos-text-muted)] mt-0.5">
                              {tx.storeName} · Cycle {tx.cycleNumber}
                              {tx.note ? ` · ${tx.note}` : ''}
                            </p>
                          </div>
                          <span className="font-mono text-[11px] text-[var(--yos-text-muted)] tabular-nums shrink-0">
                            {formatDateTime(tx.createdAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )
                ) : bundle.completedCycles.length === 0 ? (
                  <p className="text-xs text-[var(--yos-text-muted)] py-4">
                    No completed 6-stamp cycles archived yet.
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--yos-border)] border-t border-[var(--yos-border)]">
                    {bundle.completedCycles.map((cyc) => (
                      <li key={cyc.id} className="py-3.5 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-semibold text-[var(--yos-text)]">
                            {cyc.storeName} · Cycle {cyc.cycleNumber}
                          </span>
                          <span className="inline-flex items-center gap-1 font-medium text-[var(--yos-success)]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {cyc.redeemedAt ? 'Redeemed' : 'Completed'}
                          </span>
                        </div>
                        <p className="text-[var(--yos-text)]">{cyc.rewardText}</p>
                        <p className="font-mono text-[11px] text-[var(--yos-text-muted)] tabular-nums">
                          Completed {formatDateTime(cyc.completedAt)}
                          {cyc.redeemedAt ? ` · Redeemed ${formatDateTime(cyc.redeemedAt)}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
