import { Html5Qrcode } from 'html5-qrcode';
import {
  AlertCircle,
  Award,
  Camera,
  CheckCircle2,
  KeyRound,
  RotateCcw,
  Search,
  ShieldAlert,
  Stamp,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { api } from '../lib/api';
import type {
  CustomerBundle,
  StoreLocation,
  ToastMessage,
} from '../types/loyalty';
import { YosStampSlot } from './BrandMark';

interface QrScannerModalProps {
  ownerToken: string;
  stores: StoreLocation[];
  defaultStoreId: string;
  onClose: () => void;
  onStampSuccess: () => void;
  onToast: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function QrScannerModal({
  ownerToken,
  stores,
  defaultStoreId,
  onClose,
  onStampSuccess,
  onToast,
}: QrScannerModalProps) {
  const scannerRegionId = useId().replace(/:/g, '');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scanLockRef = useRef(false);

  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [cameraStatus, setCameraStatus] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualQuery, setManualQuery] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const [scannedBundle, setScannedBundle] = useState<CustomerBundle | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState(
    defaultStoreId !== 'all' ? defaultStoreId : stores[0]?.id || ''
  );
  const [ownerPin, setOwnerPin] = useState('');
  const [note, setNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{
    title: string;
    detail: string;
    completed?: boolean;
  } | null>(null);

  const idempotencyKeyRef = useRef<string>(
    `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  );

  const stopCamera = useCallback(async () => {
    const instance = scannerRef.current;
    scannerRef.current = null;
    if (!instance) return;
    try {
      if (instance.isScanning) {
        await instance.stop();
      }
    } catch {
      // Ignore stop errors if stream already halted
    }
    try {
      instance.clear();
    } catch {
      // Ignore clear errors
    }
  }, []);

  const loadCustomerFromIdentifier = useCallback(
    async (identifier: string) => {
      setLookupLoading(true);
      setLookupError(null);
      setActionError(null);
      setActionResult(null);
      try {
        const bundle = await api.ownerLookupCustomer(ownerToken, identifier);
        setScannedBundle(bundle);
        setOwnerPin('');
        setNote('');
        idempotencyKeyRef.current = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        if (
          !selectedStoreId ||
          !stores.some((s) => s.id === selectedStoreId && s.isActive)
        ) {
          setSelectedStoreId(
            bundle.customer.homeStoreId || stores.find((s) => s.isActive)?.id || ''
          );
        }
      } catch (err) {
        setLookupError(
          err instanceof Error ? err.message : 'Unable to identify customer QR code.'
        );
        scanLockRef.current = false;
      } finally {
        setLookupLoading(false);
      }
    },
    [ownerToken, selectedStoreId, stores]
  );

  const startCamera = useCallback(async () => {
    await stopCamera();
    scanLockRef.current = false;
    setCameraStatus('starting');
    setCameraError(null);

    try {
      const container = document.getElementById(scannerRegionId);
      if (!container) return;

      const html5QrCode = new Html5Qrcode(scannerRegionId, { verbose: false });
      scannerRef.current = html5QrCode;

      await html5QrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 220, height: 220 },
          aspectRatio: 1,
        },
        async (decodedText) => {
          if (scanLockRef.current) return;
          scanLockRef.current = true;
          await stopCamera();
          await loadCustomerFromIdentifier(decodedText);
        },
        () => {
          // Continuous frame scan miss — expected while aligning QR code
        }
      );

      setCameraStatus('active');
    } catch (err) {
      setCameraStatus('error');
      const msg =
        err instanceof Error
          ? err.message
          : 'Camera permission was denied or no camera is available on this device.';
      setCameraError(
        msg.includes('NotAllowedError') || msg.toLowerCase().includes('permission')
          ? 'Camera access was denied. Enable camera permissions or switch to Manual ID Lookup below.'
          : 'Could not start camera scanner on this device. You can use Manual ID Lookup instead.'
      );
    }
  }, [scannerRegionId, stopCamera, loadCustomerFromIdentifier]);

  useEffect(() => {
    if (mode === 'camera' && !scannedBundle) {
      const timer = setTimeout(() => {
        void startCamera();
      }, 120);
      return () => {
        clearTimeout(timer);
        void stopCamera();
      };
    }
    void stopCamera();
    return undefined;
  }, [mode, scannedBundle, startCamera, stopCamera]);

  useEffect(() => {
    return () => {
      void stopCamera();
    };
  }, [stopCamera]);

  const activeCard = scannedBundle?.cards.find((c) => c.storeId === selectedStoreId) || null;
  const activeStores = stores.filter((s) => s.isActive);

  const handleManualLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualQuery.trim()) return;
    await loadCustomerFromIdentifier(manualQuery.trim());
  };

  const handleAddStamp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scannedBundle || !selectedStoreId || actionLoading) return;
    setActionError(null);
    setActionLoading(true);
    try {
      const res = await api.ownerAddStamp(ownerToken, {
        customerId: scannedBundle.customer.id,
        storeId: selectedStoreId,
        pin: ownerPin,
        idempotencyKey: idempotencyKeyRef.current,
        note: note.trim() || undefined,
      });
      setScannedBundle(res.bundle);
      setOwnerPin('');
      setNote('');
      idempotencyKeyRef.current = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      setActionResult({
        title: res.completed
          ? '6/6 Stamps Completed!'
          : `Stamp ${res.stampNumber}/6 Added`,
        detail: res.completed
          ? `${scannedBundle.customer.fullName} unlocked "${res.rewardText}" at ${res.storeName}.`
          : `Authorized 1 stamp for ${scannedBundle.customer.fullName} at ${res.storeName}.`,
        completed: res.completed,
      });
      onToast({
        type: 'success',
        title: res.completed ? 'Card Completed (6/6)!' : `Stamp ${res.stampNumber}/6 Added`,
        description: `${scannedBundle.customer.fullName} · ${res.storeName}`,
      });
      onStampSuccess();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to add stamp.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRedeem = async () => {
    if (!scannedBundle || !selectedStoreId || actionLoading) return;
    setActionError(null);
    setActionLoading(true);
    try {
      const res = await api.ownerRedeemReward(ownerToken, {
        customerId: scannedBundle.customer.id,
        storeId: selectedStoreId,
        pin: ownerPin,
      });
      setScannedBundle(res.bundle);
      setOwnerPin('');
      setActionResult({
        title: 'Reward Marked as Redeemed',
        detail: `Reward redeemed for ${scannedBundle.customer.fullName}. You can now start their next 6-stamp cycle.`,
      });
      onToast({
        type: 'success',
        title: 'Reward Redeemed',
        description: `${scannedBundle.customer.fullName} (${activeCard?.storeName || ''})`,
      });
      onStampSuccess();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to redeem reward.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleStartNewCycle = async () => {
    if (!scannedBundle || !selectedStoreId || actionLoading) return;
    setActionError(null);
    setActionLoading(true);
    try {
      const res = await api.ownerStartNewCycle(ownerToken, {
        customerId: scannedBundle.customer.id,
        storeId: selectedStoreId,
        pin: ownerPin,
      });
      setScannedBundle(res.bundle);
      setOwnerPin('');
      setActionResult({
        title: `Cycle ${res.cycleNumber} Started`,
        detail: `Previous completed cycle archived safely. ${scannedBundle.customer.fullName} is ready for Cycle ${res.cycleNumber}.`,
      });
      onToast({
        type: 'success',
        title: `Started Cycle ${res.cycleNumber}`,
        description: `${scannedBundle.customer.fullName} · Previous stamps archived`,
      });
      onStampSuccess();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to start new cycle.');
    } finally {
      setActionLoading(false);
    }
  };

  const resetForNextCustomer = () => {
    setScannedBundle(null);
    setActionResult(null);
    setActionError(null);
    setLookupError(null);
    setOwnerPin('');
    setNote('');
    setManualQuery('');
    scanLockRef.current = false;
  };

  const handleKeypadDigit = (digit: string) => {
    setOwnerPin((prev) => (prev.length < 8 ? `${prev}${digit}` : prev));
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Scan Customer QR Code"
    >
      <div className="w-full max-w-xl rounded-2xl border border-[var(--yos-border-strong)] bg-[var(--yos-surface)] shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="px-5 sm:px-6 py-4 border-b border-[var(--yos-border)] flex items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-medium text-[var(--yos-text)]">
              Scan Customer QR
            </h2>
            <p className="text-xs text-[var(--yos-text-muted)]">
              Owner PIN authentication is required before every stamp addition
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void stopCamera();
              onClose();
            }}
            aria-label="Close QR scanner"
            className="w-10 h-10 rounded-lg border border-[var(--yos-border)] flex items-center justify-center text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 max-h-[82dvh] overflow-y-auto space-y-5">
          {/* Step 1: Scan or Lookup Customer */}
          {!scannedBundle ? (
            <>
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[var(--yos-surface-alt)] border border-[var(--yos-border)]">
                <button
                  type="button"
                  onClick={() => setMode('camera')}
                  className={`inline-flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    mode === 'camera'
                      ? 'bg-[var(--yos-surface)] text-[var(--yos-text)] border border-[var(--yos-border-strong)]'
                      : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                  }`}
                >
                  <Camera className="w-4 h-4" />
                  <span>Camera Scanner</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`inline-flex items-center justify-center gap-2 py-2.5 min-h-[44px] rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    mode === 'manual'
                      ? 'bg-[var(--yos-surface)] text-[var(--yos-text)] border border-[var(--yos-border-strong)]'
                      : 'text-[var(--yos-text-muted)] hover:text-[var(--yos-text)]'
                  }`}
                >
                  <Search className="w-4 h-4" />
                  <span>Manual ID / Mobile</span>
                </button>
              </div>

              {lookupError && (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-3.5 text-xs text-[var(--yos-text)] flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-[var(--yos-danger)] shrink-0 mt-0.5" />
                  <span>{lookupError}</span>
                </div>
              )}

              {mode === 'camera' ? (
                <div className="space-y-4">
                  <div className="relative rounded-xl overflow-hidden border border-[var(--yos-border)] bg-black min-h-[290px] flex items-center justify-center">
                    <div id={scannerRegionId} className="w-full" />

                    {cameraStatus === 'starting' && (
                      <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white gap-2 p-6 text-center">
                        <Camera className="w-7 h-7 text-[#d4b064]" />
                        <p className="text-sm font-medium">Starting camera viewfinder…</p>
                        <p className="text-xs text-white/70">
                          Allow camera access when prompted to scan customer QR codes.
                        </p>
                      </div>
                    )}

                    {cameraStatus === 'error' && (
                      <div className="absolute inset-0 bg-[var(--yos-surface)] flex flex-col items-center justify-center p-6 text-center gap-3">
                        <AlertCircle className="w-8 h-8 text-[var(--yos-warning)]" />
                        <p className="text-sm font-semibold text-[var(--yos-text)]">
                          Camera Unavailable
                        </p>
                        <p className="text-xs text-[var(--yos-text-muted)] max-w-xs leading-relaxed">
                          {cameraError}
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                          <button
                            type="button"
                            onClick={() => void startCamera()}
                            className="px-4 py-2 min-h-[40px] rounded-lg border border-[var(--yos-border-strong)] text-xs font-medium text-[var(--yos-text)] hover:bg-[var(--yos-surface-alt)] cursor-pointer"
                          >
                            Retry Camera
                          </button>
                          <button
                            type="button"
                            onClick={() => setMode('manual')}
                            className="px-4 py-2 min-h-[40px] rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-xs font-semibold hover:bg-[var(--yos-accent-strong)] cursor-pointer"
                          >
                            Enter Customer ID
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-center text-[var(--yos-text-muted)]">
                    Align the customer&apos;s YOS COLLECTION QR code inside the frame.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleManualLookup} className="space-y-4">
                  <div>
                    <label
                      htmlFor="owner-manual-qr"
                      className="block text-xs font-medium text-[var(--yos-text-muted)] mb-2"
                    >
                      Customer ID, QR Payload, or Mobile Number
                    </label>
                    <input
                      id="owner-manual-qr"
                      type="text"
                      required
                      autoFocus
                      value={manualQuery}
                      onChange={(e) => setManualQuery(e.target.value)}
                      placeholder="e.g., YOS-482917 or +1 555 019 4820"
                      className="w-full h-12 px-4 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm font-mono text-[var(--yos-text)] placeholder:font-sans placeholder:text-[var(--yos-text-muted)]/60"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={lookupLoading}
                    className="w-full h-12 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-sm font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    {lookupLoading ? 'Looking Up Customer…' : 'Verify Customer'}
                  </button>
                </form>
              )}
            </>
          ) : (
            /* Step 2: Customer Identified -> Select Store -> Owner PIN -> Add Stamp */
            <div className="space-y-5">
              {/* Customer Identity Header */}
              <div className="rounded-xl border border-[var(--yos-card-border)] bg-[var(--yos-bg)] p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs text-[var(--yos-text-muted)]">Verified Customer</p>
                  <p className="font-display text-2xl font-medium text-[var(--yos-text)] mt-0.5">
                    {scannedBundle.customer.fullName}
                  </p>
                  <p className="font-mono text-xs text-[var(--yos-text-muted)] mt-1 tabular-nums">
                    {scannedBundle.customer.id} · {scannedBundle.customer.mobileNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetForNextCustomer}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg border border-[var(--yos-border)] text-xs font-medium text-[var(--yos-text-muted)] hover:text-[var(--yos-text)] cursor-pointer shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Rescan</span>
                </button>
              </div>

              {/* Blocked Warning */}
              {scannedBundle.customer.isBlocked && (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-4 flex items-start gap-3"
                >
                  <ShieldAlert className="w-5 h-5 text-[var(--yos-danger)] shrink-0 mt-0.5" />
                  <p className="text-xs text-[var(--yos-text)]">
                    This customer account is blocked. Re-enable the account from the
                    Customers directory before issuing stamps.
                  </p>
                </div>
              )}

              {/* Store Location Selector */}
              <div>
                <label
                  htmlFor="scanner-store-select"
                  className="block text-xs font-medium text-[var(--yos-text-muted)] mb-2"
                >
                  Boutique Store Location
                </label>
                <select
                  id="scanner-store-select"
                  value={selectedStoreId}
                  onChange={(e) => {
                    setSelectedStoreId(e.target.value);
                    setActionError(null);
                    setActionResult(null);
                    idempotencyKeyRef.current = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                  }}
                  className="w-full h-11 px-3.5 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-sm text-[var(--yos-text)]"
                >
                  {activeStores.map((store) => {
                    const card = scannedBundle.cards.find((c) => c.storeId === store.id);
                    return (
                      <option key={store.id} value={store.id}>
                        {store.name} ({card ? `${card.currentStamps}/6` : '0/6'} Stamps)
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Current 6-Stamp Mini Card */}
              {activeCard && (
                <div className="rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface-alt)]/45 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-[var(--yos-text)]">
                      {activeCard.storeName} · Cycle {activeCard.cycleNumber}
                    </span>
                    <span className="font-mono text-xs font-semibold text-[var(--yos-accent)] tabular-nums">
                      {activeCard.currentStamps} / 6 Stamps
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
                  <p className="text-xs text-[var(--yos-text-muted)]">
                    Reward: <span className="text-[var(--yos-text)]">{activeCard.rewardText}</span>
                  </p>
                </div>
              )}

              {/* Success Confirmation Banner */}
              {actionResult && (
                <div className="rounded-xl border border-[var(--yos-success)]/50 bg-[var(--yos-success)]/10 p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-[var(--yos-success)] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--yos-text)]">
                      {actionResult.title}
                    </p>
                    <p className="text-xs text-[var(--yos-text-muted)] mt-0.5">
                      {actionResult.detail}
                    </p>
                  </div>
                </div>
              )}

              {actionError && (
                <div
                  role="alert"
                  className="rounded-xl border border-[var(--yos-danger)]/50 bg-[var(--yos-danger)]/10 p-3.5 text-xs text-[var(--yos-text)] flex items-start gap-2.5"
                >
                  <AlertCircle className="w-4 h-4 text-[var(--yos-danger)] shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}

              {/* Per-Operation Owner PIN Authorization Form */}
              {!scannedBundle.customer.isBlocked && activeCard && (
                <form onSubmit={handleAddStamp} className="space-y-4 pt-2 border-t border-[var(--yos-border)]">
                  <div>
                    <label
                      htmlFor="stamp-owner-pin"
                      className="flex items-center gap-1.5 text-xs font-semibold text-[var(--yos-text)] mb-2"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-[var(--yos-accent)]" />
                      <span>Enter Owner PIN to Authorize</span>
                    </label>
                    <input
                      id="stamp-owner-pin"
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]{4,8}"
                      maxLength={8}
                      autoComplete="off"
                      required
                      value={ownerPin}
                      onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, ''))}
                      placeholder="Enter Owner PIN"
                      className="w-full h-12 px-4 rounded-xl border border-[var(--yos-border-strong)] bg-[var(--yos-bg)] text-base font-mono tracking-[0.35em] text-center text-[var(--yos-text)] placeholder:tracking-normal placeholder:font-sans placeholder:text-sm"
                    />
                  </div>

                  {/* Mobile-Friendly Quick PIN Keypad */}
                  <div className="grid grid-cols-6 gap-1.5 sm:hidden">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleKeypadDigit(d)}
                        className="h-11 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-bg)] font-mono text-sm font-semibold text-[var(--yos-text)] active:bg-[var(--yos-surface-alt)]"
                      >
                        {d}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setOwnerPin((p) => p.slice(0, -1))}
                      className="col-span-2 h-11 rounded-lg border border-[var(--yos-border)] bg-[var(--yos-surface-alt)] text-xs font-medium text-[var(--yos-text)]"
                    >
                      Clear
                    </button>
                  </div>

                  {activeCard.status === 'in_progress' && activeCard.currentStamps < 6 ? (
                    <>
                      <div>
                        <label
                          htmlFor="stamp-purchase-note"
                          className="block text-xs text-[var(--yos-text-muted)] mb-1.5"
                        >
                          Purchase Note (Optional)
                        </label>
                        <input
                          id="stamp-purchase-note"
                          type="text"
                          maxLength={140}
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="e.g., Silk Evening Dress · Receipt #412"
                          className="w-full h-11 px-3.5 rounded-xl border border-[var(--yos-border)] bg-[var(--yos-bg)] text-xs text-[var(--yos-text)]"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={actionLoading || ownerPin.length < 4}
                        className="w-full h-12 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-sm font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-55 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Stamp className="w-4 h-4" />
                        <span>
                          {actionLoading
                            ? 'Authorizing Stamp…'
                            : `Authorize & Add Stamp (${activeCard.currentStamps + 1}/6)`}
                        </span>
                      </button>
                    </>
                  ) : (
                    <div className="space-y-2.5">
                      {activeCard.status === 'completed' && (
                        <button
                          type="button"
                          onClick={handleRedeem}
                          disabled={actionLoading || ownerPin.length < 4}
                          className="w-full h-12 rounded-xl bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-sm font-semibold hover:bg-[var(--yos-accent-strong)] disabled:opacity-55 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Award className="w-4 h-4" />
                          <span>
                            {actionLoading ? 'Processing…' : 'Mark 6-Stamp Reward as Redeemed'}
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleStartNewCycle}
                        disabled={actionLoading || ownerPin.length < 4}
                        className="w-full h-12 rounded-xl border border-[var(--yos-accent)] bg-[var(--yos-surface-alt)] text-[var(--yos-text)] text-sm font-semibold hover:bg-[var(--yos-surface)] disabled:opacity-55 transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4 text-[var(--yos-accent)]" />
                        <span>
                          {actionLoading
                            ? 'Starting Cycle…'
                            : `Archive & Start Cycle ${activeCard.cycleNumber + 1}`}
                        </span>
                      </button>
                    </div>
                  )}
                </form>
              )}

              {actionResult && (
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={resetForNextCustomer}
                    className="px-4 py-2.5 min-h-[44px] rounded-lg border border-[var(--yos-border-strong)] text-xs font-semibold text-[var(--yos-text)] hover:bg-[var(--yos-surface-alt)] cursor-pointer"
                  >
                    Scan Next Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void stopCamera();
                      onClose();
                    }}
                    className="px-4 py-2.5 min-h-[44px] rounded-lg bg-[var(--yos-surface-alt)] text-xs font-medium text-[var(--yos-text)] cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
