import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Notification } from '../models/interfaces';
import { LoggerService } from './logger.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  notifications = signal<Notification[]>([]);
  unreadCount = signal(0);
  fetchError = signal(false);
  private pollInterval: any;

  constructor(private http: HttpClient, private logger: LoggerService) {}

  startPolling() {
    this.fetch();
    this.pollInterval = setInterval(() => this.fetch(), 30000);
  }

  stopPolling() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  fetch() {
    this.http.get<{ data: Notification[]; total: number; unreadCount: number }>('/api/notifications?limit=10').subscribe({
      next: (res) => {
        this.notifications.set(res.data);
        this.unreadCount.set(res.unreadCount);
        this.fetchError.set(false);
      },
      error: (err) => {
        this.fetchError.set(true);
        this.logger.error('notification', 'Notification polling failed', { status: err?.status });
      },
    });
  }

  markRead(id: string) {
    this.http.patch<any>(`/api/notifications/${id}/read`, {}).subscribe({
      next: () => this.fetch(),
    });
  }

  markAllRead() {
    this.http.patch('/api/notifications/read-all', {}).subscribe({
      next: () => this.fetch(),
    });
  }

  /** Full notification list for inbox page */
  listAll(): Observable<{ data: Notification[]; total: number; unreadCount: number }> {
    return this.http.get<{ data: Notification[]; total: number; unreadCount: number }>('/api/notifications');
  }

  markReadById(id: string): Observable<any> {
    return this.http.patch(`/api/notifications/${id}/read`, {});
  }

  markAllReadRequest(): Observable<any> {
    return this.http.patch('/api/notifications/read-all', {});
  }

  reset() {
    this.stopPolling();
    this.notifications.set([]);
    this.unreadCount.set(0);
    this.fetchError.set(false);
  }
}
