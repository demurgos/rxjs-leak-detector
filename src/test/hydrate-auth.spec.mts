// import {describe, test} from "node:test";
// import {LeakDetector} from "../lib/index.mjs";
// import {NEVER as RX_NEVER, Observable, of as rxOf, ReplaySubject, concat as rxConcat, Subscription} from "rxjs";
//
// class TransferState {
//   #store?: null | string;
//
//   public constructor(data?: null | string) {
//     this.#store = data;
//   }
//
//   public getAuth(): undefined | null | string {
//     return this.#store;
//   }
// }
//
// class ApiClient {
//   public getSelf(): Observable<null | string> {
//     return rxOf("alice");
//   }
// }
//
// describe("hydrateAuth", () => {
//   // test("baseLeak", () => {
//   //   const leakDetector = new LeakDetector();
//   //   leakDetector.spy(Observable);
//   //   {
//   //     class AuthComponent {
//   //       readonly #auth$: ReplaySubject<string | null>;
//   //
//   //       constructor(transferState: TransferState, apiClient: ApiClient) {
//   //         let initialAuth: Observable<null | string>;
//   //         const transferred = transferState.getAuth();
//   //         if (transferred !== undefined) {
//   //           initialAuth = rxOf(transferred);
//   //         } else {
//   //           initialAuth = apiClient.getSelf();
//   //         }
//   //         const infInitialAuth = rxConcat(initialAuth, RX_NEVER);
//   //         this.#auth$ = new ReplaySubject(1);
//   //         infInitialAuth.subscribe(this.#auth$);
//   //       }
//   //
//   //       public auth(): Observable<null | string> {
//   //         return this.#auth$;
//   //       }
//   //     }
//   //
//   //     const component = new AuthComponent(new TransferState(), new ApiClient());
//   //     const auth$ = component.auth();
//   //     const sub = auth$.subscribe();
//   //     sub.unsubscribe();
//   //   }
//   //   const leakState = leakDetector.getActive();
//   //   assert.strictEqual(leakState.size, 2);
//   //   leakDetector.assertEmpty();
//   // });
//
//   test("baseLeak", () => {
//     const leakDetector = new LeakDetector(Observable);
//     using _spy = leakDetector.globalSpy();
//     {
//       class AuthComponent {
//         readonly #auth$: ReplaySubject<string | null>;
//         readonly #authSub: Subscription;
//
//         constructor(transferState: TransferState, apiClient: ApiClient) {
//           let initialAuth: Observable<null | string>;
//           const transferred = transferState.getAuth();
//           if (transferred !== undefined) {
//             initialAuth = rxOf(transferred);
//           } else {
//             initialAuth = apiClient.getSelf();
//           }
//           const infInitialAuth = rxConcat(initialAuth, RX_NEVER);
//           this.#auth$ = new ReplaySubject(1);
//           this.#authSub = infInitialAuth.subscribe(this.#auth$);
//         }
//
//         public auth(): Observable<null | string> {
//           return this.#auth$;
//         }
//
//         public destroy(): void {
//           this.#authSub.unsubscribe();
//           // this.#auth$.unsubscribe();
//         }
//       }
//
//       const component = new AuthComponent(new TransferState(), new ApiClient());
//       const auth$ = component.auth();
//       const sub = auth$.subscribe();
//       sub.unsubscribe();
//       component.destroy();
//     }
//     const leakSnapshot = leakDetector.snapshot();
//     leakSnapshot.assertEmptyOrPrintReportToConsole();
//   });
//
//   // test("baseLeakFixed", () => {
//   //   const leakDetector = new LeakDetector();
//   //   leakDetector.spy(Observable);
//   //   {
//   //     class AuthComponent {
//   //       readonly #auth$: Observable<string | null>;
//   //       // readonly #subscription: Subscription;
//   //
//   //       constructor(_transferState: TransferState, _apiClient: ApiClient) {
//   //         // let initialAuth: Observable<null | string>;
//   //         // const transferred = transferState.getAuth();
//   //         // if (transferred !== undefined) {
//   //         //   initialAuth = rxOf(transferred);
//   //         // } else {
//   //         //   initialAuth = apiClient.getSelf();
//   //         // }
//   //         const infInitialAuth = mergeAll(1)(rxOf(RX_NEVER)) // rxConcat(RX_NEVER);
//   //         this.#auth$ = infInitialAuth;
//   //         // this.#subscription = infInitialAuth.subscribe(this.#auth$);
//   //       }
//   //
//   //       public auth(): Observable<null | string> {
//   //         return this.#auth$;
//   //       }
//   //
//   //       public dispose(): void {
//   //         // this.#auth$.unsubscribe();
//   //         // this.#subscription.unsubscribe();
//   //       }
//   //     }
//   //
//   //     const component = new AuthComponent(new TransferState(), new ApiClient());
//   //     const auth$ = component.auth();
//   //     const sub = auth$.subscribe({
//   //       next(v) {
//   //         console.log("next", v);
//   //       },
//   //       complete() {
//   //         console.log("complete");
//   //       },
//   //       error(err) {
//   //         console.log("err", err);
//   //       }
//   //     });
//   //     sub.unsubscribe();
//   //     component.dispose();
//   //   }
//   //   const leakState = leakDetector.getActive();
//   //   assert.strictEqual(leakState.size, 1);
//   //   leakDetector.assertEmpty();
//   // });
// });
