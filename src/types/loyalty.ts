export type ThemePalette = 'obsidian' | 'gold' | 'cream' | 'white';

export type AppView = 'landing' | 'customer' | 'owner';

export interface StoreLocation {
  id: string;
  name: string;
  location: string;
  rewardOverride: string | null;
  effectiveRewardText: string;
  isActive: boolean;
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  fullName: string;
  mobileNumber: string;
  qrCodeValue: string;
  homeStoreId: string | null;
  isBlocked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StoreStampCard {
  id: string;
  customerId: string;
  storeId: string;
  storeName: string;
  storeLocation: string;
  rewardText: string;
  currentStamps: number;
  cycleNumber: number;
  status: 'in_progress' | 'completed' | 'redeemed';
  completedAt: string | null;
  redeemedAt: string | null;
  totalStampsEarned: number;
  totalCyclesCompleted: number;
  ownerNotified: boolean;
  lastStampedAt: string | null;
  updatedAt: string;
}

export interface CompletedCycleRecord {
  id: string;
  customerId: string;
  storeId: string;
  storeName: string;
  cycleNumber: number;
  stampsCount: number;
  rewardText: string;
  completedAt: string;
  redeemedAt: string | null;
  startedNewCycleAt: string | null;
}

export interface StampTransaction {
  id: string;
  customerId: string;
  customerName?: string;
  storeId: string;
  storeName: string;
  cycleNumber: number;
  actionType: 'stamp_added' | 'card_completed' | 'reward_redeemed' | 'cycle_started' | string;
  stampNumber: number | null;
  note: string | null;
  createdAt: string;
}

export interface CustomerBundle {
  customer: CustomerProfile;
  rewardText: string;
  stores: StoreLocation[];
  cards: StoreStampCard[];
  completedCycles: CompletedCycleRecord[];
  transactions: StampTransaction[];
}

export interface OwnerCustomerSummary extends CustomerProfile {
  totalStampsEarned: number;
  totalCyclesCompleted: number;
  hasCompletedReward: boolean;
  cards: StoreStampCard[];
}

export interface CompletionAlert {
  customerId: string;
  customerName: string;
  mobileNumber: string;
  storeId: string;
  storeName: string;
  cycleNumber: number;
  rewardText: string;
  completedAt: string;
  unread: boolean;
}

export interface ActivityPoint {
  label: string;
  stamps: number;
}

export interface OwnerDashboardData {
  rewardText: string;
  stores: StoreLocation[];
  kpis: {
    totalStampsIssued: number;
    completedRewardCards: number;
    totalCustomers: number;
    activeCustomers: number;
    pendingRedemptions: number;
  };
  analytics: {
    daily: ActivityPoint[];
    weekly: ActivityPoint[];
    monthly: ActivityPoint[];
  };
  completionAlerts: CompletionAlert[];
  recentTransactions: StampTransaction[];
  customers: OwnerCustomerSummary[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
