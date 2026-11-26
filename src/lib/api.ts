import type {
  CustomerBundle,
  OwnerDashboardData,
  StoreLocation,
} from '../types/loyalty';

export class ApiError extends Error {
  status: number;
  existingCustomerId?: string;

  constructor(message: string, status: number, existingCustomerId?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.existingCustomerId = existingCustomerId;
  }
}

async function requestJson<T>(
  url: string,
  options: RequestInit = {},
  ownerToken?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (ownerToken) {
    headers.Authorization = `Bearer ${ownerToken}`;
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }

  if (!response.ok) {
    const message =
      typeof data.error === 'string'
        ? data.error
        : `Request failed with status ${response.status}`;
    const existingId =
      typeof data.existingCustomerId === 'string' ? data.existingCustomerId : undefined;
    throw new ApiError(message, response.status, existingId);
  }

  return data as T;
}

export const api = {
  getBootstrap: () =>
    requestJson<{ stores: StoreLocation[]; rewardText: string }>('/api/public/bootstrap'),

  registerCustomer: (payload: {
    fullName: string;
    mobileNumber: string;
    homeStoreId?: string;
  }) =>
    requestJson<CustomerBundle>('/api/customers/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  lookupCustomer: (query: string) =>
    requestJson<CustomerBundle>('/api/customers/lookup', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  getCustomerCard: (customerId: string) =>
    requestJson<CustomerBundle>(`/api/customers/${encodeURIComponent(customerId)}/card`),

  ownerLogin: (pin: string) =>
    requestJson<{ token: string; expiresAt: string }>('/api/owner/login', {
      method: 'POST',
      body: JSON.stringify({ pin }),
    }),

  ownerLogout: (token: string) =>
    requestJson<{ success: boolean }>(
      '/api/owner/logout',
      { method: 'POST' },
      token
    ),

  ownerVerifySession: (token: string) =>
    requestJson<{ authenticated: boolean }>('/api/owner/session', {}, token),

  ownerChangePin: (
    token: string,
    payload: { currentPin: string; newPin: string; confirmNewPin: string }
  ) =>
    requestJson<{ success: boolean; updatedAt: string }>(
      '/api/owner/change-pin',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    ),

  ownerGetDashboard: (token: string, storeId = 'all') =>
    requestJson<OwnerDashboardData>(
      `/api/owner/dashboard?storeId=${encodeURIComponent(storeId)}`,
      {},
      token
    ),

  ownerLookupCustomer: (token: string, identifier: string) =>
    requestJson<CustomerBundle>(
      `/api/owner/customers/${encodeURIComponent(identifier)}`,
      {},
      token
    ),

  ownerAddStamp: (
    token: string,
    payload: {
      customerId: string;
      storeId: string;
      pin: string;
      idempotencyKey: string;
      note?: string;
    }
  ) =>
    requestJson<{
      success: boolean;
      transactionId: string;
      stampNumber: number;
      completed: boolean;
      storeId: string;
      storeName: string;
      rewardText: string;
      bundle: CustomerBundle;
    }>(
      '/api/owner/stamps/add',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    ),

  ownerRedeemReward: (
    token: string,
    payload: { customerId: string; storeId: string; pin: string }
  ) =>
    requestJson<{ success: boolean; bundle: CustomerBundle }>(
      '/api/owner/rewards/redeem',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    ),

  ownerStartNewCycle: (
    token: string,
    payload: { customerId: string; storeId: string; pin: string }
  ) =>
    requestJson<{ success: boolean; cycleNumber: number; bundle: CustomerBundle }>(
      '/api/owner/cycles/start',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    ),

  ownerUpdateCustomer: (
    token: string,
    customerId: string,
    payload: { fullName?: string; mobileNumber?: string; isBlocked?: boolean }
  ) =>
    requestJson<{ success: boolean; bundle: CustomerBundle }>(
      `/api/owner/customers/${encodeURIComponent(customerId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      token
    ),

  ownerUpdateSettings: (token: string, rewardText: string) =>
    requestJson<{ success: boolean; rewardText: string; updatedAt: string }>(
      '/api/owner/settings',
      { method: 'PUT', body: JSON.stringify({ rewardText }) },
      token
    ),

  ownerCreateStore: (
    token: string,
    payload: { name: string; location: string; rewardOverride?: string }
  ) =>
    requestJson<{ store: StoreLocation }>(
      '/api/owner/stores',
      { method: 'POST', body: JSON.stringify(payload) },
      token
    ),

  ownerUpdateStore: (
    token: string,
    storeId: string,
    payload: {
      name?: string;
      location?: string;
      rewardOverride?: string | null;
      isActive?: boolean;
    }
  ) =>
    requestJson<{ store: StoreLocation }>(
      `/api/owner/stores/${encodeURIComponent(storeId)}`,
      { method: 'PATCH', body: JSON.stringify(payload) },
      token
    ),
};

export interface SyncEventPayload {
  type: string;
  customerId?: string;
  storeId?: string;
  actionType?: string;
  timestamp: string;
}

export function subscribeToSyncEvents(onEvent: (event: SyncEventPayload) => void): () => void {
  const source = new EventSource('/api/events');
  source.onmessage = (evt) => {
    try {
      const parsed = JSON.parse(evt.data) as SyncEventPayload;
      onEvent(parsed);
    } catch {
      // Ignore malformed heartbeat frames
    }
  };
  return () => {
    source.close();
  };
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
