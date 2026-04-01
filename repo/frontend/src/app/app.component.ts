import { Component, OnInit, OnDestroy } from '@angular/core';
import { ShellComponent } from './layout/shell/shell.component';
import { TimeSyncService } from './core/services/time-sync.service';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ShellComponent],
  template: `<app-shell />`,
})
export class AppComponent implements OnInit, OnDestroy {
  constructor(private timeSync: TimeSyncService, private auth: AuthService) {}

  ngOnInit() {
    // Initialize time sync on app bootstrap if user is logged in
    if (this.auth.isLoggedIn()) {
      this.timeSync.init();
    }
  }

  ngOnDestroy() {
    this.timeSync.destroy();
  }
}
