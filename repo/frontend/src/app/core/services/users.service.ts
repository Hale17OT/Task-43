import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class UsersService {
  constructor(private http: HttpClient) {}

  list(params?: Record<string, string>): Observable<{ data: User[]; total: number }> {
    const query = params ? new URLSearchParams(params).toString() : '';
    return this.http.get<{ data: User[]; total: number }>(`/api/users?${query}`);
  }

  create(payload: Record<string, any>): Observable<{ user: User }> {
    return this.http.post<{ user: User }>('/api/users', payload);
  }

  update(id: string, payload: Record<string, any>): Observable<{ user: User }> {
    return this.http.patch<{ user: User }>(`/api/users/${id}`, payload);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/users/${id}`);
  }

  listLawyers(): Observable<{ data: User[] }> {
    return this.http.get<{ data: User[] }>('/api/lawyers');
  }
}
