import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Organization } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class OrganizationsService {
  constructor(private http: HttpClient) {}

  list(): Observable<{ data: Organization[]; total: number }> {
    return this.http.get<{ data: Organization[]; total: number }>('/api/organizations');
  }

  create(name: string): Observable<{ organization: Organization }> {
    return this.http.post<{ organization: Organization }>('/api/organizations', { name });
  }
}
