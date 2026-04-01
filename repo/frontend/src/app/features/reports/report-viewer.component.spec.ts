import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportViewerComponent } from './report-viewer.component';
import { AuthService } from '../../core/services/auth.service';

describe('ReportViewerComponent', () => {
  let component: ReportViewerComponent;
  let fixture: ComponentFixture<ReportViewerComponent>;
  let httpMock: HttpTestingController;

  function createAuthSpy(role: string) {
    return {
      currentUser: () => ({ id: 'u1', orgId: 'org-1', username: 'admin1', role, creditScore: 50 }),
      isLoggedIn: () => true,
      userRole: () => role,
      menuPermissions: () => ['admin.dashboard', 'reports'],
      getToken: () => 'mock-token',
      handleLoginSuccess: () => {},
      clearSession: () => {},
      logout: () => {},
      hasPermission: () => true,
      getDefaultRoute: () => '/admin/dashboard',
    };
  }

  describe('as admin', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ReportViewerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: AuthService, useValue: createAuthSpy('admin') },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ReportViewerComponent);
      component = fixture.componentInstance;
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('loads dashboard metrics on init', () => {
      fixture.detectChanges();
      const req = httpMock.expectOne(r => r.url.includes('/api/reports/dashboard'));
      expect(req.request.method).toBe('GET');
      req.flush({
        availability: 85, faultRate: 5, utilization: 70,
        throughput: 42, closedLoopEfficiency: 90,
        period: { from: '2025-01-01', to: '2025-01-31' },
      });
      expect(component.metrics).toBeTruthy();
      expect(component.metrics!.availability).toBe(85);
      expect(component.metricItems.length).toBe(5);
    });

    it('does not fetch organizations for non-super_admin', () => {
      fixture.detectChanges();
      httpMock.expectOne(r => r.url.includes('/api/reports/dashboard')).flush({
        availability: 0, faultRate: 0, utilization: 0, throughput: 0,
        closedLoopEfficiency: 0, period: { from: '', to: '' },
      });
      httpMock.expectNone('/api/organizations');
      expect(component.isSuperAdmin).toBeFalse();
    });

    it('exportUrl builds correct CSV URL', () => {
      expect(component.exportUrl('csv')).toContain('format=csv');
    });

    it('exportUrl builds correct XLSX URL', () => {
      expect(component.exportUrl('xlsx')).toContain('format=xlsx');
    });
  });

  describe('as super_admin', () => {
    beforeEach(async () => {
      await TestBed.configureTestingModule({
        imports: [ReportViewerComponent],
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: AuthService, useValue: createAuthSpy('super_admin') },
        ],
      }).compileComponents();

      fixture = TestBed.createComponent(ReportViewerComponent);
      component = fixture.componentInstance;
      httpMock = TestBed.inject(HttpTestingController);
    });

    afterEach(() => httpMock.verify());

    it('fetches organizations for super_admin', () => {
      fixture.detectChanges();
      httpMock.expectOne('/api/organizations').flush({ data: [{ id: 'org-1', name: 'Test Org' }] });
      httpMock.expectOne(r => r.url.includes('/api/reports/dashboard')).flush({
        availability: 0, faultRate: 0, utilization: 0, throughput: 0,
        closedLoopEfficiency: 0, period: { from: '', to: '' },
      });
      expect(component.organizations.length).toBe(1);
      expect(component.isSuperAdmin).toBeTrue();
    });
  });
});
