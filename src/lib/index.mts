import type {Observable, Observer, Subscription} from "rxjs";

interface ZoneLike {
  parent: ZoneLike | null;
  fork(spec: {name: string}): this;
  run<T>(callback: () => T): T;
}

type SubscribeFn = <T>(observerOrNext?: Partial<Observer<T>> | ((value: T) => void)) => Subscription;

interface LeakDetectorPatch {
  readonly original: SubscribeFn;
  readonly patched: SubscribeFn;
}

export class GlobalSpy {
  #enabled: boolean;
  #teardown: () => void;

  constructor(teardpwm: () => void) {
    this.#enabled = true;
    this.#teardown = teardpwm;
  }

  isEnabled(): boolean {
    return this.#enabled;
  }

  public disable(): void {
    this.#enabled = false;
    this.#teardown();
  }

  public [Symbol.dispose](): void {
    this.disable();
  }
}

export class ZoneSpy {
  #enabled: boolean;
  #zone: ZoneLike;
  #teardown: () => void;

  constructor(zone: ZoneLike, teardpwm: () => void) {
    this.#enabled = true;
    this.#zone = zone;
    this.#teardown = teardpwm;
  }

  run<T>(callback: () => T): T {
    return this.#zone.run(callback);
  }

  public isEnabled(): boolean {
    return this.#enabled && this.#inZone();
  }

  #inZone() {
    // @ts-ignore
    let zone: ZoneLike = Zone.current;
    const visited: Set<ZoneLike> = new Set();
    while (visited.size < 1000) {
      if (zone === this.#zone) {
        return true;
      }
      if (visited.has(zone)) {
        // detected loop
        return false;
      }
      visited.add(zone);
      if (zone.parent === null || (typeof zone.parent) !== "object") {
        return false;
      }
      zone = zone.parent;
    }
    return false;
  }

  public disable(): void {
    this.#enabled = false;
    this.#teardown();
  }

  public [Symbol.dispose](): void {
    this.disable();
  }
}

export type AnySpy = GlobalSpy | ZoneSpy;

interface SubscriptionMeta {
  calls: Set<number>;
  tracked: string[];
  untracked: number;
}

export class LeakDetector {
  readonly #activeSpy: Set<AnySpy>;
  readonly #observableClass: typeof Observable;
  #spyCount: number;
  #patch: LeakDetectorPatch | null;
  #time: number;

  #subscriptions: Map<Subscription, SubscriptionMeta>;

  constructor(observableClass: typeof Observable) {
    this.#spyCount = 0;
    this.#activeSpy = new Set();
    this.#observableClass = observableClass;
    this.#patch = null;
    this.#time = 0;
    this.#subscriptions = new Map();
  }

  globalSpy(): GlobalSpy {
    const spy = new GlobalSpy(() => this.#disableSpy(spy));
    this.#enableSpy(spy);
    return spy;
  }

  zoneSpy(): ZoneSpy {
    // @ts-ignore
    const parentZone: ZoneLike = Zone.current;
    const zone: ZoneLike = parentZone.fork({name: "RxjsLeakDetectorZoneSpy"});
    const spy = new ZoneSpy(zone, () => this.#disableSpy(spy));
    this.#enableSpy(spy);
    return spy;
  }

  snapshot(): Snapshot {
    const result = new Map();
    for (const [sub, meta] of this.#subscriptions) {
      const metaClone: SubscriptionMeta = {
        calls: new Set([...meta.calls]),
        tracked: [...meta.tracked],
        untracked: meta.untracked,
      };
      result.set(sub, metaClone);
    }
    return new Snapshot(result);
  }

  #enableSpy(spy: AnySpy) {
    if (this.#activeSpy.has(spy)) {
      // already enabled
      return;
    }
    this.#activeSpy.add(spy);
    this.#ensurePatched();
    this.#spyCount += 1;
  }

  #disableSpy(spy: AnySpy) {
    const wasActive = this.#activeSpy.delete(spy);
    if (!wasActive) {
      // already disabled
      return;
    }
    this.#spyCount -= 1;
    if (this.#spyCount <= 0) {
      this.#tryUnpatch();
    }
  }

  #ensurePatched() {
    if (this.#patch === null) {
      const observablePrototype = this.#observableClass.prototype;
      const original: SubscribeFn = observablePrototype.subscribe;
      if (!(typeof original === "function")) {
        throw new Error("invalid LeakDetector target: Observable class is missing `subscribe` function in prototype");
      }
      const self = this;
      const patched: SubscribeFn = function subscribe(this: any, ...args: any[]): Subscription {
        return self.#handleSubscribe(original, this, args);
      }
      observablePrototype.subscribe = patched as any;
      this.#patch = {original, patched};
    }
  }

  #tryUnpatch() {
    if (this.#patch !== null) {
      const observablePrototype = this.#observableClass.prototype;
      // double check that our call patch is still the active one
      if (observablePrototype.subscribe === this.#patch.patched) {
        observablePrototype.subscribe = this.#patch.original as any;
        this.#patch = null;
      }
    }
  }

  // #getZone(): Zone {
  //   if (this.#zone === null) {
  //     this.#zone = Zone.current.fork({name: "LeakDetector", properties: {[this.#key]: this}});
  //   }
  //   return this.#zone;
  // }

  #handleSubscribe(original: SubscribeFn, target: any, args: any[]): Subscription {
    const sub: Subscription = original.call(target, ...args);
    if (this.#spyCount <= 0) {
      return sub;
    }
    let hasEnabledSpy = false;
    for (const spy of this.#activeSpy) {
      if (spy.isEnabled()) {
        hasEnabledSpy = true;
        break;
      }
    }
    if (!hasEnabledSpy) {
      return sub;
    }

    const time = this.#time++;
    // See <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack#description>
    // v8 has a short stack by default (10 lines), extend to 1000 lines.
    const oldLimit: number | undefined = Error.stackTraceLimit;
    if (typeof oldLimit === "number") {
      Error.stackTraceLimit = 1000;
    }
    const stack: string | undefined = new Error(`RxjsLeakDetectorStackCapture(${time})`).stack;
    if (typeof oldLimit === "number") {
      Error.stackTraceLimit = oldLimit;
    }

    let meta = this.#subscriptions.get(sub);
    if (meta === undefined) {
      meta = {calls: new Set(), tracked: [], untracked: 0};
      this.#subscriptions.set(sub, meta);
      // note that `sub.add` is called immediately if the subscription is created in a closed state
      sub.add((): void => {
        this.#subscriptions.delete(sub);
      });
    }
    meta.calls.add(time);
    if (stack !== undefined) {
      meta.tracked.push(stack);
    } else {
      meta.untracked += 1;
    }

    return sub;
  }
}

export class Snapshot {
  public subscriptions: Map<Subscription, SubscriptionMeta>

  public constructor(subscriptions?: Map<Subscription, SubscriptionMeta>) {
    if (subscriptions === undefined) {
      subscriptions = new Map();
    }
    this.subscriptions = subscriptions;
  }

  public assertEmptyOrPrintReportToConsole() {
    if (this.subscriptions.size === 0) {
      return;
    }

    const totalLeaks = this.subscriptions.size;
    console.error(`start RxJS LeakDetector report: count=${totalLeaks}`);
    let leakId = 0;
    for (const meta of this.subscriptions.values()) {
      console.error(`start leaked subscription: index=${leakId}, subscriptionCallCount=${meta.calls.size}, subscriptionCallTime=[${[...meta.calls].join(",")}]`)
      for (const stack of meta.tracked) {
        console.error(stack);
      }
      console.error(`end leaked subscription: index=${leakId}`)
      leakId += 1;
    }
    console.error("end RxJS LeakDetector report");

    throw new Error(`RxJsSubscriptionLeakDetected: count=${totalLeaks}`);
  }
}

//
// export class LeakDetector {
//   readonly #key: string;
//   #zone: Zone | null;
//
//   constructor() {
//     this.#key = generateDetectorKey();
//     this.#zone = null;
//   }
//
//   #getZone(): Zone {
//     if (this.#zone === null) {
//       this.#zone = Zone.current.fork({name: "LeakDetector", properties: {[this.#key]: this}});
//     }
//     return this.#zone;
//   }
// }
//
// export class LeakDetector2 {
//   #id: number;
//   #active: Map<Subscription, SubscriptionMeta>;
//
//   constructor() {
//     this.#id = 0;
//     this.#active = new Map();
//   }
//
//   public spyZone() {
//     Zone.current.fork()
//
//     Zone.current.run(() => {
//
//     })
//   }
//
//   public spy(observableClass: typeof Observable) {
//     const self = this;
//     const subscribeFn = observableClass.prototype.subscribe;
//     observableClass.prototype.subscribe = function(...args: any[]): Subscription {
//       const id = self.#id++;
//       // See <https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Error/stack#description>
//       // v8 has a short stack by default (10 lines), extend to 1000 lines.
//       const oldLimit: number | undefined = Error.stackTraceLimit;
//       if (typeof oldLimit === "number") {
//         Error.stackTraceLimit = 1000;
//       }
//       const stack: string | undefined = new Error(`RxjsLeakDetectorStackCapture(${id})`).stack;
//       if (typeof oldLimit === "number") {
//         Error.stackTraceLimit = oldLimit;
//       }
//
//       const sub = subscribeFn.call(this, ...args);
//       let meta = self.#active.get(sub);
//       if (meta === undefined) {
//         meta = {calls: new Set(), tracked: [], untracked: 0};
//         self.#active.set(sub, meta);
//       }
//       meta.calls.add(id);
//       if (stack !== undefined) {
//         meta.tracked.push(stack);
//       } else {
//         meta.untracked += 1;
//       }
//
//       sub.add(function(this: Subscription): void {
//         self.#active.delete(sub);
//       })
//
//       return sub;
//     };
//   }
//
//   public getActive(): Map<Subscription, SubscriptionMeta> {
//   }
//
//   public assertEmpty() {
//     if (this.#active.size === 0) {
//       return;
//     }
//
//     const totalLeaks = this.#active.size;
//     console.error(`start RxJS LeakDetector report: count=${totalLeaks}`);
//     let leakId = 0;
//     for (const meta of this.#active.values()) {
//       console.error(`start leaked subscription: index=${leakId}, subscriptionCallCount=${meta.calls.size}, subscriptionCallTime=[${[...meta.calls].join(",")}]`)
//       for (const stack of meta.tracked) {
//         console.error(stack);
//       }
//       console.error(`end leaked subscription: index=${leakId}`)
//       leakId += 1;
//     }
//     console.error("end RxJS LeakDetector report");
//
//     throw new Error(`RxJsSubscriptionLeakDetected: count=${totalLeaks}`);
//   }
// }
