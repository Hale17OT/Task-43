import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ArbitrationComponent } from './arbitration.component';

describe('ArbitrationComponent', () => {
  let component: ArbitrationComponent;
  let fixture: ComponentFixture<ArbitrationComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ArbitrationComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ArbitrationComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should create and load pending disputes on init', () => {
    fixture.detectChanges();
    const req = httpMock.expectOne('/api/disputes?status=pending,under_review');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [
      { id: 'd1', status: 'pending', appellantId: 'u1', reason: 'Unfair', filedAt: '2025-01-01' },
    ] });
    expect(component.disputes.length).toBe(1);
    expect(component.loading).toBeFalse();
  });

  it('switches to resolved tab and loads resolved disputes', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/disputes?status=pending,under_review').flush({ data: [] });

    component.activeTab = 'resolved';
    component.loadDisputes();
    const req = httpMock.expectOne('/api/disputes?status=resolved,dismissed');
    req.flush({ data: [{ id: 'd2', status: 'resolved', appellantId: 'u2', reason: 'Test', filedAt: '2025-01-01' }] });
    expect(component.disputes.length).toBe(1);
  });

  it('submits resolution with correct payload keys', fakeAsync(() => {
    fixture.detectChanges();
    httpMock.expectOne('/api/disputes?status=pending,under_review').flush({ data: [
      { id: 'd1', status: 'pending', appellantId: 'u1', reason: 'Unfair', filedAt: '2025-01-01' },
    ] });

    component.resolvingId = 'd1';
    component.resolution = 'upheld';
    component.resolutionNotes = 'Review was biased';
    component.submitResolution('d1');

    const req = httpMock.expectOne('/api/disputes/d1/resolve');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ resolution: 'upheld', notes: 'Review was biased' });
    req.flush({ dispute: { id: 'd1', status: 'resolved' } });
    tick();

    expect(component.resolving).toBeFalse();
    expect(component.resolvingId).toBeNull();
    // Should reload disputes
    httpMock.expectOne('/api/disputes?status=pending,under_review').flush({ data: [] });
  }));

  it('resolution with empty notes sends undefined for notes', fakeAsync(() => {
    fixture.detectChanges();
    httpMock.expectOne('/api/disputes?status=pending,under_review').flush({ data: [
      { id: 'd1', status: 'pending', appellantId: 'u1', reason: 'Unfair', filedAt: '2025-01-01' },
    ] });

    component.resolvingId = 'd1';
    component.resolution = 'dismissed';
    component.resolutionNotes = '';
    component.submitResolution('d1');

    const req = httpMock.expectOne('/api/disputes/d1/resolve');
    expect(req.request.body.resolution).toBe('dismissed');
    expect(req.request.body.notes).toBeUndefined();
    req.flush({ dispute: { id: 'd1', status: 'dismissed' } });
    tick();
    httpMock.expectOne('/api/disputes?status=pending,under_review').flush({ data: [] });
  }));
});
