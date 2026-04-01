import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Review, Dispute } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class ReviewsService {
  constructor(private http: HttpClient) {}

  listByReviewer(userId: string, opts?: { page?: number; limit?: number }): Observable<{ data: Review[]; total: number }> {
    const params: any = { reviewerId: userId };
    if (opts?.page) params.page = opts.page;
    if (opts?.limit) params.limit = opts.limit;
    return this.http.get<{ data: Review[]; total: number }>(`/api/reviews?${new URLSearchParams(params)}`);
  }

  listByReviewee(userId: string, opts?: { page?: number; limit?: number }): Observable<{ data: Review[]; total: number }> {
    const params: any = { revieweeId: userId };
    if (opts?.page) params.page = opts.page;
    if (opts?.limit) params.limit = opts.limit;
    return this.http.get<{ data: Review[]; total: number }>(`/api/reviews?${new URLSearchParams(params)}`);
  }

  create(payload: { bookingId: string; timeliness: number; professionalism: number; communication: number; comment?: string }): Observable<{ review: Review }> {
    return this.http.post<{ review: Review }>('/api/reviews', payload);
  }

  listDisputes(status?: string): Observable<{ data: Dispute[]; total: number }> {
    const url = status ? `/api/disputes?status=${status}` : '/api/disputes';
    return this.http.get<{ data: Dispute[]; total: number }>(url);
  }

  resolveDispute(id: string, payload: { resolution: string; notes?: string }): Observable<{ dispute: Dispute }> {
    return this.http.patch<{ dispute: Dispute }>(`/api/disputes/${id}/resolve`, payload);
  }

  fileDispute(payload: { reviewId: string; reason: string }): Observable<{ dispute: Dispute }> {
    return this.http.post<{ dispute: Dispute }>('/api/disputes', payload);
  }
}
