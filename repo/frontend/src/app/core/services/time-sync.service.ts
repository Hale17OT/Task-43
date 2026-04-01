import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { LoggerService } from './logger.service';

@Injectable({ providedIn: 'root' })
export class TimeSyncService {
  private offsetMs = 0;
  private syncInterval: any;
  syncError = signal(false);

  constructor(private http: HttpClient, private logger: LoggerService) {}

  init() {
    this.sync();
    this.syncInterval = setInterval(() => this.sync(), 5 * 60 * 1000);
  }

  destroy() {
    if (this.syncInterval) clearInterval(this.syncInterval);
  }

  serverNow(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  private sync() {
    const clientBefore = Date.now();
    this.http.get<{ serverTime: string }>('/api/time').subscribe({
      next: (res) => {
        const clientAfter = Date.now();
        const rtt = clientAfter - clientBefore;
        const serverTime = new Date(res.serverTime).getTime();
        this.offsetMs = serverTime - clientBefore - rtt / 2;
        this.syncError.set(false);
      },
      error: (err) => {
        this.syncError.set(true);
        this.logger.warn('sync', 'Time sync failed', { status: err?.status });
      },
    });
  }
}
