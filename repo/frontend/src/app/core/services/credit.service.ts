import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreditHistory } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class CreditService {
  constructor(private http: HttpClient) {}

  getScore(userId: string): Observable<{ creditScore: number }> {
    return this.http.get<{ creditScore: number }>(`/api/credit/${userId}`);
  }

  getHistory(userId: string, opts?: { page?: number; limit?: number }): Observable<{ creditScore: number; data: CreditHistory[]; total: number }> {
    const params: any = {};
    if (opts?.page) params.page = opts.page;
    if (opts?.limit) params.limit = opts.limit;
    const query = new URLSearchParams(params).toString();
    return this.http.get<{ creditScore: number; data: CreditHistory[]; total: number }>(`/api/credit/${userId}?${query}`);
  }
}
