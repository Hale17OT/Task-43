import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Availability } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class AvailabilityService {
  constructor(private http: HttpClient) {}

  list(lawyerId: string): Observable<{ data: Availability[] }> {
    return this.http.get<{ data: Availability[] }>(`/api/availability?lawyerId=${lawyerId}`);
  }

  // Note: backend uses PATCH for updates per availability.routes.ts
  create(slot: Record<string, any>): Observable<{ slot: Availability }> {
    return this.http.post<{ slot: Availability }>('/api/availability', slot);
  }

  update(id: string, slot: Record<string, any>): Observable<{ slot: Availability }> {
    return this.http.patch<{ slot: Availability }>(`/api/availability/${id}`, slot);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/availability/${id}`);
  }
}
