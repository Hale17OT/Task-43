export interface User {
  id: string;
  orgId: string;
  username: string;
  role: 'client' | 'lawyer' | 'admin' | 'super_admin';
  creditScore: number;
  isActive?: boolean;
  dailyCapacity?: number;
}

export interface LoginResponse {
  token: string;
  user: User;
  menuPermissions: string[];
  serverTime: string;
}

export interface Booking {
  id: string;
  clientId: string;
  lawyerId: string;
  orgId: string;
  type: 'consultation' | 'milestone';
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show' | 'declined' | 'rescheduled';
  scheduledAt: string | null;
  deadlineAt: string | null;
  weight: number;
  completedAt: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Availability {
  id: string;
  lawyerId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMin: number;
  isActive: boolean;
}

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  timeliness: number;
  professionalism: number;
  communication: number;
  comment: string | null;
  createdAt: string;
}

export interface Dispute {
  id: string;
  reviewId: string;
  appellantId: string;
  reason: string;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed';
  resolutionNotes: string | null;
  adminId: string | null;
  filedAt: string;
  resolvedAt: string | null;
}

export interface CreditHistory {
  id: string;
  userId: string;
  previousScore: number;
  changeAmount: number;
  newScore: number;
  ruleCode: string;
  reason: string;
  isEscrowed: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  type: string | null;
  referenceId: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  priority: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'dead';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  latencyMs: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface DashboardMetrics {
  availability: number;
  faultRate: number;
  utilization: number;
  throughput: number;
  closedLoopEfficiency: number;
  period: { from: string; to: string };
}

export interface Organization {
  id: string;
  name: string;
  settings: Record<string, unknown>;
  created_at: string;
}

export interface ReportSubscription {
  id: string;
  user_id: string;
  report_type: string;
  filters: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
}

export interface ApiError {
  error: string;
  message: string;
  details?: any[];
  retryAfterSeconds?: number;
}
