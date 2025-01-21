import "zone.js/node";

import {describe, test} from "node:test";
import {LeakDetector} from "../lib/index.mjs";
import {Observable, of as rxOf} from "rxjs";
import * as assert from "node:assert/strict";
import {hangingValue, makeClean, makeLeak, sleep} from "./test-helpers.mjs";

describe("zoneSpy", () => {
  test("detectLeak1", () => {
    const leakDetector = new LeakDetector(Observable);
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => makeLeak(0));
    }
    const leakSnapshot = leakDetector.snapshot();
    assert.strictEqual(leakSnapshot.subscriptions.size, 1);
  });

  test("detectClean1", () => {
    const leakDetector = new LeakDetector(Observable);
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => makeClean(0));
    }
    const leakSnapshot = leakDetector.snapshot();
    leakSnapshot.assertEmptyOrPrintReportToConsole();
  });

  test("detectAutoclosedLeak", () => {
    const leakDetector = new LeakDetector(Observable);
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => rxOf(0).subscribe());
    }
    const leakSnapshot = leakDetector.snapshot();
    leakSnapshot.assertEmptyOrPrintReportToConsole();
  });

  test("detectAutoclosedClean", () => {
    const leakDetector = new LeakDetector(Observable);
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => rxOf(0).subscribe().unsubscribe());
    }
    const leakSnapshot = leakDetector.snapshot();
    leakSnapshot.assertEmptyOrPrintReportToConsole();
  });

  test("detectIdempotentUnsubscribe", () => {
    const leakDetector = new LeakDetector(Observable);
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => {
        const sub = hangingValue(0).subscribe();
        sub.unsubscribe();
        sub.unsubscribe();
      });
    }
    const leakSnapshot = leakDetector.snapshot();
    leakSnapshot.assertEmptyOrPrintReportToConsole();
  });

  test("detectMixed", () => {
    const leakDetector = new LeakDetector(Observable);
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => {
        makeLeak(0);
        makeClean(1);
        makeLeak(2);
        makeClean(3);
      });
    }
    const leakSnapshot = leakDetector.snapshot();
    assert.strictEqual(leakSnapshot.subscriptions.size, 2);
  });

  test("detectMultipleSpies", () => {
    const leakDetector = new LeakDetector(Observable);
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => makeLeak(0));
    }
    {
      makeLeak(1);
    }
    {
      using spy = leakDetector.zoneSpy();
      spy.run(() => makeLeak(2));
    }
    const leakSnapshot = leakDetector.snapshot();
    assert.strictEqual(leakSnapshot.subscriptions.size, 2);
  });

  test("detectMultipleDetectorsSequential", () => {
    const leakDetector1 = new LeakDetector(Observable);
    const leakDetector2 = new LeakDetector(Observable);
    {
      using spy = leakDetector1.zoneSpy();
      spy.run(() => makeLeak(0));
    }
    {
      using spy = leakDetector2.zoneSpy();
      spy.run(() => makeLeak(1));
    }
    {
      using spy = leakDetector1.zoneSpy();
      spy.run(() => makeLeak(2));
    }
    const leakSnapshot1 = leakDetector1.snapshot();
    assert.strictEqual(leakSnapshot1.subscriptions.size, 2);
    const leakSnapshot2 = leakDetector2.snapshot();
    assert.strictEqual(leakSnapshot2.subscriptions.size, 1);
  });

  test("detectMultipleDetectorsNested", () => {
    const leakDetector1 = new LeakDetector(Observable);
    const leakDetector2 = new LeakDetector(Observable);
    {
      using spy = leakDetector1.zoneSpy();
      spy.run(() => {
        makeLeak(0)
        {
          using spy = leakDetector2.zoneSpy();
          spy.run(() => makeLeak(1));
        }
        makeLeak(2);
      });
    }
    const leakSnapshot1 = leakDetector1.snapshot();
    assert.strictEqual(leakSnapshot1.subscriptions.size, 3);
    const leakSnapshot2 = leakDetector2.snapshot();
    assert.strictEqual(leakSnapshot2.subscriptions.size, 1);
  });

  test("intertwinedExecutionPollution", async () => {
    async function makeThread(offset: number) {
      await sleep(offset);
      const leakDetector = new LeakDetector(Observable);
      using spy = leakDetector.zoneSpy();
      await spy.run(async () => {
        makeLeak(0);
        await sleep(100);
        makeLeak(1);
      });
      const leakSnapshot = leakDetector.snapshot();
      // we get `2` as expected thanks to the zone; note that this
      // does not support native async/await, so tests are compiled
      // to ES2016
      assert.strictEqual(leakSnapshot.subscriptions.size, 2);
    }

    const thread1 = makeThread(0);
    const thread2 = makeThread(50);
    await Promise.all([thread1, thread2]);
  });
});
