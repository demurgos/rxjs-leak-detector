import {Observable, Subscriber, TeardownLogic} from "rxjs";

// returns an observable that emits `value` once and then remain in a pending state
// (no completion)
export function hangingValue<T>(value: T): Observable<T> {
  return new Observable((subscriber: Subscriber<T>): TeardownLogic => {
    subscriber.next(value);
  });
}

export function makeLeak(value: unknown): void {
  hangingValue(value).subscribe()
}

export function makeClean(value: unknown): void {
  hangingValue(value).subscribe().unsubscribe();
}

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration)
  });
}
