import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DashboardMetrics, Organization, ReportSubscription } from '../models/interfaces';

@Injectable({ providedIn: 'root' })
export class ReportsService {
  constructor(private http: HttpClient) {}

  getDashboard(params: Record<string, string> = {}): Observable<DashboardMetrics> {
    const query = new URLSearchParams(params).toString();
    return this.http.get<DashboardMetrics>(`/api/reports/dashboard?${query}`);
  }

  getOrganizations(): Observable<{ data: Organization[] }> {
    return this.http.get<{ data: Organization[] }>('/api/organizations');
  }

  exportUrl(params: Record<string, string>): string {
    return `/api/reports/export?${new URLSearchParams(params).toString()}`;
  }

  listSubscriptions(): Observable<{ data: ReportSubscription[] }> {
    return this.http.get<{ data: ReportSubscription[] }>('/api/report-subscriptions');
  }

  createSubscription(reportType: string): Observable<{ subscription: ReportSubscription }> {
    return this.http.post<{ subscription: ReportSubscription }>('/api/report-subscriptions', { reportType });
  }

  toggleSubscription(id: string, isActive: boolean): Observable<{ subscription: ReportSubscription }> {
    return this.http.patch<{ subscription: ReportSubscription }>(`/api/report-subscriptions/${id}`, { is_active: isActive });
  }

  deleteSubscription(id: string): Observable<void> {
    return this.http.delete<void>(`/api/report-subscriptions/${id}`);
  }
}
