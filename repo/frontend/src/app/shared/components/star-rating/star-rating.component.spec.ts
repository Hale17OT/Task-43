import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StarRatingComponent } from './star-rating.component';

describe('StarRatingComponent', () => {
  let component: StarRatingComponent;
  let fixture: ComponentFixture<StarRatingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StarRatingComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StarRatingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render 5 stars', () => {
    const stars = fixture.nativeElement.querySelectorAll('.star');
    expect(stars.length).toBe(5);
  });

  it('should apply filled class based on value', () => {
    component.value = 3;
    fixture.detectChanges();
    const stars = fixture.nativeElement.querySelectorAll('.star');
    expect(stars[0].classList.contains('filled')).toBeTrue();
    expect(stars[1].classList.contains('filled')).toBeTrue();
    expect(stars[2].classList.contains('filled')).toBeTrue();
    expect(stars[3].classList.contains('filled')).toBeFalse();
    expect(stars[4].classList.contains('filled')).toBeFalse();
  });

  it('should emit valueChange when a star is clicked', () => {
    spyOn(component.valueChange, 'emit');
    const stars = fixture.nativeElement.querySelectorAll('.star');
    stars[3].click(); // 4th star
    expect(component.value).toBe(4);
    expect(component.valueChange.emit).toHaveBeenCalledWith(4);
  });

  it('should not emit when readonly', () => {
    component.readonly = true;
    fixture.detectChanges();
    spyOn(component.valueChange, 'emit');
    const stars = fixture.nativeElement.querySelectorAll('.star');
    stars[2].click();
    expect(component.valueChange.emit).not.toHaveBeenCalled();
  });

  it('should apply readonly class when readonly', () => {
    component.readonly = true;
    fixture.detectChanges();
    const stars = fixture.nativeElement.querySelectorAll('.star');
    expect(stars[0].classList.contains('readonly')).toBeTrue();
  });

  it('should have aria labels', () => {
    const stars = fixture.nativeElement.querySelectorAll('.star');
    expect(stars[0].getAttribute('aria-label')).toBe('Rate 1 of 5');
    expect(stars[4].getAttribute('aria-label')).toBe('Rate 5 of 5');
  });
});
