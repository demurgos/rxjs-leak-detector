# RxJS Leak Detector

[![npm](https://img.shields.io/npm/v/rxjs-leak-detector.svg?maxAge=2592000)](https://www.npmjs.com/package/rxjs-leak-detector)
[![GitHub repository](https://img.shields.io/badge/Github-demurgos%2Frxjs--leak--detector-blue.svg)](https://github.com/demurgos/rxjs-leak-detector)
[![Codecov](https://codecov.io/gh/demurgos/rxjs-leak-detector/branch/master/graph/badge.svg)](https://codecov.io/gh/demurgos/rxjs-leak-detector)

Advanced leak detector for RxJS 7.

This is a debugging tool to help you find `Subscription` values that you forget
to unsubscribe from.

## Quick usage

```typescript
import { Observable, Subscriber, TeardownLogic } from "rxjs";
import { LeakDetector } from "rxjs-leak-detector";

// example observable, returns a value but never completes
export function hangingValue<T>(value: T): Observable<T> {
  return new Observable((subscriber: Subscriber<T>): TeardownLogic => {
    subscriber.next(value);
  });
}

function checkLeaks() {
  // Create a leak detector attached to the provided `Observable` class.
  const leakDetector = new LeakDetector(Observable);
  // create a spy scope, all subscriptions created while the spy is alive will
  // be tracked
  {
    // the example uses explicit resource management, you can also clean-up
    // manually with `.disable()`
    using _spy = leakDetector.globalSpy();

    const observable$ = hangingValue("Hello, World!");
    const sub = observable$.subscribe({
      next(v) {
        console.log(v);
      },
    });
    // prints `Hello, World!`

    const snapshot = leakDetector.snapshot();
    // `snapshot.subscriptions` is a map from subscription to metadata (mainly stacktrace and number of calls)
    console.log(snaphot.subscriptions.size); // 1

    // In a testing environment you can use the following helper to print
    // a report and throw if `snaphot.subscriptions` is not empty:
    // snapshot.assertEmptyOrPrintReportToConsole();

    // clean-up the subscription and check the new state
    sub.unsubscribe();

    const snapshot2 = leakDetector.snapshot();
    console.log(snaphot2.subscriptions.size); // 0
    snapshot2.assertEmptyOrPrintReportToConsole();
  }
}
```

For more advanced usage, see the test in the repo.

## Internals and limitations

`rxjs-leak-detector` works by patching the `subscribe` method on `Observable`
to track subscription creation. The method is patched when a `globalSpy` is
active and restore to its initial state when all spies are disabled. You can
create multiple `LeakDetector` instances, but it is recommended to use them
sequentially to avoid overlapping spies. In such case, subscriptions will
be tracked by all leak detectors: it will still work, but you may get duplicates
in case of leak. Nesting leak detectors works.

To support concurrent leak detectors, `LeakDetector` has optional integration
with `zone.js`. You must activate `zone.js` at the start of your program.

```typescript
import "zone.js/node";

import { Observable, Subscriber, TeardownLogic } from "rxjs";
import { LeakDetector } from "rxjs-leak-detector";

// run three leaks concurrently
await Promise.all([
  checkLeaks(),
  checkLeaks(),
  checkLeaks(),
]);

async function checkLeaks() {
  const leakDetector = new LeakDetector(Observable);
  {
    // Create a Zone-aware spy
    using spy = leakDetector.zoneSpy();

    // create 3 leaks
    // note: `znone.js` requires async functions to be desuggared, configuring
    // typescript to target ES2016 works.
    await spy.run(async () => {
      const observable$ = hangingValue("Hello, World!");
      sleep(50);
      const sub1 = observable$.subscribe({
        next(v) {
          console.log(v);
        },
      });
      sleep(50);
      const sub2 = observable$.subscribe({
        next(v) {
          console.log(v);
        },
      });
      sleep(50);
      const sub3 = observable$.subscribe({
        next(v) {
          console.log(v);
        },
      });
    });
  }
  const snapshot = leakDetector.snapshot();
  console.log(snaphot.subscriptions.size); // 3
  // the code above prints 3 as expected, even if in practice there are
  // multiple concurrent leak detectors running at the same time
}

export function hangingValue<T>(value: T): Observable<T> {
  return new Observable((subscriber: Subscriber<T>): TeardownLogic => {
    subscriber.next(value);
  });
}

export function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, duration);
  });
}
```

## License

[MIT License](./LICENSE.md)
