export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  timeliness: number;
  professionalism: number;
  communication: number;
  comment: string | null;
  createdAt: Date;
}

export const RATING_MIN = 1;
export const RATING_MAX = 5;
export const COMMENT_MAX_LENGTH = 1000;
export const DISPUTE_WINDOW_DAYS = 7;

export function isWithinDisputeWindow(reviewCreatedAt: Date, serverNow: Date): boolean {
  const windowMs = DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return serverNow.getTime() <= reviewCreatedAt.getTime() + windowMs;
}

export function isValidRating(value: number): boolean {
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX;
}
