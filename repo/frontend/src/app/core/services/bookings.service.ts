import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Booking } from '../models/interfaces';

export interface CreateBookingPayload {
  type: 'consultation' | 'milestone';
  lawyerId: string;
  idempotencyKey: string;
  scheduledAt?: string;
  deadlineAt?: string;
  weight?: number;
}

@Injectable({ providedIn: 'root' })
export class BookingsService {
  constructor(private http: HttpClient) {}

  list(params: Record<string, string> = {}): Observable<{ data: Booking[]; total: number }> {
    const query = new URLSearchParams(params).toString();
    return this.http.get<{ data: Booking[]; total: number }>(`/api/bookings?${query}`);
  }

  create(payload: CreateBookingPayload): Observable<{ booking: Booking }> {
    return this.http.post<{ booking: Booking }>('/api/bookings', payload);
  }

  confirm(id: string): Observable<{ booking: Booking }> {
    return this.http.patch<{ booking: Booking }>(`/api/bookings/${id}/confirm`, {});
  }

  decline(id: string): Observable<{ booking: Booking }> {
    return this.http.patch<{ booking: Booking }>(`/api/bookings/${id}/decline`, {});
  }

  complete(id: string): Observable<{ booking: Booking }> {
    return this.http.patch<{ booking: Booking }>(`/api/bookings/${id}/complete`, {});
  }

  markNoShow(id: string): Observable<{ booking: Booking }> {
    return this.http.patch<{ booking: Booking }>(`/api/bookings/${id}/no-show`, {});
  }

  cancel(id: string, reason?: string): Observable<any> {
    return this.http.patch(`/api/bookings/${id}/cancel`, reason ? { reason } : {});
  }

  reschedule(id: string, newScheduledAt: string, idempotencyKey: string): Observable<any> {
    return this.http.patch(`/api/bookings/${id}/reschedule`, { newScheduledAt, idempotencyKey });
  }
}
