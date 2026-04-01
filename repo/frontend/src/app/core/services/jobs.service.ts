import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Job } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class JobsService {
  constructor(private http: HttpClient) {}

  list(params: Record<string, string> = {}): Observable<{ data: Job[]; total: number }> {
    const query = new URLSearchParams(params).toString();
    return this.http.get<{ data: Job[]; total: number }>(`/api/jobs?${query}`);
  }
}
