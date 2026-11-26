import { ArrowRight, MapPin, QrCode, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { AppView, StoreLocation } from '../types/loyalty';
import { HangerIcon, YosStampSlot } from './BrandMark';

interface LandingViewProps {
  stores: StoreLocation[];
  rewardText: string;
  onNavigate: (view: AppView) => void;
  onOpenCustomerWithStore: (storeId: string) => void;
}

const HERO_IMAGE = '/src/assets/images/yos_boutique_hero_1795604443660.jpg';
const CRAFT_IMAGE = '/src/assets/images/yos_gold_hanger_craft_1795604445145.jpg';

export function LandingView({
  stores,
  rewardText,
  onNavigate,
  onOpenCustomerWithStore,
}: LandingViewProps) {
  const [heroImgFailed, setHeroImgFailed] = useState(false);
  const [craftImgFailed, setCraftImgFailed] = useState(false);

  return (
    <div className="pb-20">
      {/* Hero Section: Balanced 2-column architectural split */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between py-2 sm:py-4">
            <div className="space-y-6">
              <div className="flex items-center gap-3 text-xs font-medium text-[var(--yos-text-muted)]">
                <span>YOS COLLECTION Atelier</span>
                <span aria-hidden="true">·</span>
                <span>Digital Loyalty Program</span>
              </div>

              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.6rem] font-medium leading-[1.06] tracking-tight text-[var(--yos-text)]">
                Six tailored visits. One signature privilege.
              </h1>

              <p className="text-base text-[var(--yos-text-muted)] leading-relaxed max-w-xl">
                Carry your personal YOS COLLECTION stamp card on any phone. Present your
                QR code at checkout, collect six gold hanger stamps at each boutique
                location, and unlock{' '}
                <span className="text-[var(--yos-text)] font-medium">{rewardText}</span>.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate('customer')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-lg bg-[var(--yos-accent)] text-[var(--yos-accent-contrast)] text-sm font-semibold hover:bg-[var(--yos-accent-strong)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <span>Open or Create Card</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('owner')}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3.5 min-h-[48px] rounded-lg border border-[var(--yos-border-strong)] bg-[var(--yos-surface)] text-[var(--yos-text)] text-sm font-medium hover:bg-[var(--yos-surface-alt)] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-[var(--yos-accent)]" />
                  <span>Owner Dashboard</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-6 pt-10 mt-10 border-t border-[var(--yos-border)]">
              <div>
                <p className="font-mono text-2xl font-semibold text-[var(--yos-text)] tabular-nums">
                  06
                </p>
                <p className="text-xs text-[var(--yos-text-muted)] mt-1">
                  Gold stamps per branch card
                </p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold text-[var(--yos-text)] tabular-nums">
                  {String(stores.length || 3).padStart(2, '0')}
                </p>
                <p className="text-xs text-[var(--yos-text-muted)] mt-1">
                  Synced boutique locations
                </p>
              </div>
              <div>
                <p className="font-mono text-2xl font-semibold text-[var(--yos-text)] tabular-nums">
                  100%
                </p>
                <p className="text-xs text-[var(--yos-text-muted)] mt-1">
                  Owner PIN verified stamps
                </p>
              </div>
            </div>
          </div>

          {/* Focal Hero Photograph */}
          <div className="lg:col-span-6 relative rounded-2xl overflow-hidden border border-[var(--yos-border)] min-h-[320px] lg:min-h-[480px] bg-[var(--yos-surface)]">
            {!heroImgFailed ? (
              <img
                src={HERO_IMAGE}
                alt="YOS COLLECTION flagship boutique interior with brushed gold clothing rails and stone displays"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-10 bg-gradient-to-br from-[#191610] to-[#0a0a0b] text-[#f5f2eb]">
                <HangerIcon className="w-16 h-16 text-[#c9a86a] mb-4" />
                <p className="font-display text-2xl tracking-[0.2em]">YOS COLLECTION</p>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex flex-col justify-end p-6 sm:p-8">
              <p className="text-xs text-[#e5d6b8] tracking-[0.14em]">
                HOUSE PRIVILEGE · REWARD UPON SIX STAMPS
              </p>
              <p className="font-display text-2xl sm:text-3xl text-white mt-1.5">
                {rewardText}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Digital Stamp Craft & How It Works */}
      <section className="border-y border-[var(--yos-border)] bg-[var(--yos-surface)]/55 py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5 relative rounded-2xl overflow-hidden border border-[var(--yos-border)] aspect-[4/3] bg-[var(--yos-surface)]">
              {!craftImgFailed ? (
                <img
                  src={CRAFT_IMAGE}
                  alt="Brushed champagne gold couture hanger resting beside cashmere fabric on dark stone"
                  referrerPolicy="no-referrer"
                  onError={() => setCraftImgFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[var(--yos-surface-alt)]">
                  <HangerIcon className="w-16 h-16 text-[var(--yos-accent)]" />
                </div>
              )}
            </div>

            <div className="lg:col-span-7 space-y-8">
              <div>
                <p className="text-xs text-[var(--yos-text-muted)]">
                  How the Stamp Card Works
                </p>
                <h2 className="font-display text-3xl sm:text-4xl font-medium text-[var(--yos-text)] mt-2">
                  Crafted for effortless checkout at every salon.
                </h2>
              </div>

              {/* Live tactile preview of the 6 gold/outline stamp slots */}
              <div className="p-6 rounded-2xl border border-[var(--yos-card-border)] bg-[var(--yos-card-bg)] yos-card-sheen">
                <div className="flex items-center justify-between gap-4 pb-5 mb-5 border-b border-[var(--yos-border)]">
                  <div className="flex items-center gap-3">
                    <HangerIcon className="w-6 h-6 text-[var(--yos-accent)]" />
                    <span className="font-display text-lg tracking-[0.14em] text-[var(--yos-text)]">
                      YOS COLLECTION
                    </span>
                  </div>
                  <span className="font-mono text-xs text-[var(--yos-text-muted)] tabular-nums">
                    4 / 6 Stamps Preview
                  </span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 justify-items-center">
                  {[1, 2, 3, 4, 5, 6].map((slot) => (
                    <YosStampSlot key={slot} index={slot} filled={slot <= 4} compact />
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <p className="font-mono text-xs text-[var(--yos-accent)] tabular-nums">01</p>
                  <h3 className="text-sm font-semibold text-[var(--yos-text)] mt-1.5">
                    Instant Registration
                  </h3>
                  <p className="text-xs text-[var(--yos-text-muted)] mt-1.5 leading-relaxed">
                    Register with your full name and mobile number to receive a permanent Customer ID and QR code.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs text-[var(--yos-accent)] tabular-nums">02</p>
                  <h3 className="text-sm font-semibold text-[var(--yos-text)] mt-1.5">
                    PIN-Authorized Scanning
                  </h3>
                  <p className="text-xs text-[var(--yos-text-muted)] mt-1.5 leading-relaxed">
                    Our store owner scans your QR code and authorizes each purchase with a private server-hashed PIN.
                  </p>
                </div>
                <div>
                  <p className="font-mono text-xs text-[var(--yos-accent)] tabular-nums">03</p>
                  <h3 className="text-sm font-semibold text-[var(--yos-text)] mt-1.5">
                    Archived Reward Cycles
                  </h3>
                  <p className="text-xs text-[var(--yos-text-muted)] mt-1.5 leading-relaxed">
                    Complete 6 stamps at any branch to unlock your reward while preserving every past cycle permanently.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Boutique Store Locations */}
      <section
        id="boutique-locations"
        className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 sm:pt-20"
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-8 border-b border-[var(--yos-border)]">
          <div>
            <p className="text-xs text-[var(--yos-text-muted)]">
              Multi-Store Loyalty Network
            </p>
            <h2 className="font-display text-3xl sm:text-4xl font-medium text-[var(--yos-text)] mt-1.5">
              YOS COLLECTION Boutiques
            </h2>
          </div>
          <p className="text-sm text-[var(--yos-text-muted)] max-w-md">
            One Customer QR works across all branches, with dedicated 6-stamp cards and reward tracking per store location.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
          {stores.map((store) => (
            <div
              key={store.id}
              className="rounded-xl border border-[var(--yos-border)] bg-[var(--yos-surface)] p-6 flex flex-col justify-between gap-6 hover:border-[var(--yos-border-strong)] transition-colors"
            >
              <div>
                <div className="flex items-center gap-2 text-xs text-[var(--yos-text-muted)]">
                  <MapPin className="w-3.5 h-3.5 text-[var(--yos-accent)] shrink-0" />
                  <span>{store.location}</span>
                </div>
                <h3 className="font-display text-2xl font-medium text-[var(--yos-text)] mt-2">
                  {store.name}
                </h3>
                <p className="text-xs text-[var(--yos-text-muted)] mt-3 leading-relaxed">
                  6-Stamp Reward: <span className="text-[var(--yos-text)]">{store.effectiveRewardText}</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => onOpenCustomerWithStore(store.id)}
                className="inline-flex items-center justify-between w-full px-4 py-2.5 min-h-[44px] rounded-lg border border-[var(--yos-border)] bg-[var(--yos-surface-alt)]/55 text-xs font-medium text-[var(--yos-text)] hover:border-[var(--yos-accent)] transition-colors cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <QrCode className="w-3.5 h-3.5 text-[var(--yos-accent)]" />
                  <span>Open Branch Card</span>
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
