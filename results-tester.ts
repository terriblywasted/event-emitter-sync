import { EventEmitter } from "./emitter";
import { EventStatistics } from "./event-statistics";
import { awaitTimeout } from "./utils";
import { logWithTimestamp } from "./logging";

const TEST_PASS_RATE = 1.0;
const ASYNC_TOLERANCE = 1;

export class ResultsTester<T extends string> {
  private eventsCount: Map<T, number> = new Map();
  private eventFailures: Map<T, number> = new Map();

  eventNames: T[];
  emitter: EventEmitter<T>;
  handler: EventStatistics<T>;
  repository: EventStatistics<T>;

  constructor({
    eventNames,
    emitter,
    handler,
    repository,
  }: {
    eventNames: T[];
    emitter: EventEmitter<T>;
    handler: EventStatistics<T>;
    repository: EventStatistics<T>;
  }) {
    this.eventNames = eventNames;
    this.emitter = emitter;
    this.handler = handler;
    this.repository = repository;

    eventNames.forEach((eventName) => {
      this.emitter.subscribe(eventName, () => {
        this.eventsCount.set(
          eventName,
          (this.eventsCount.get(eventName) || 0) + 1
        );
      });
    });
  }

  private checkEventWithHandlerAndRepository(eventName: T): Boolean {
    const firedEventsCount = this.eventsCount.get(eventName) || 0;
    const handledEventsCount = this.handler.getStats(eventName) || 0;
    const savedEventsCount = this.repository.getStats(eventName) || 0;
    const failureCount = this.eventFailures.get(eventName) || 0;

    logWithTimestamp(`Checking event ${eventName}`);
    logWithTimestamp(`Fired: ${firedEventsCount}, Handled: ${handledEventsCount}, Saved: ${savedEventsCount}, Failures: ${failureCount}`);

    if (Math.abs(firedEventsCount - handledEventsCount) > ASYNC_TOLERANCE) {
      logWithTimestamp(`Test for event ${eventName} failed: handled events differ beyond tolerance.`);
      this.eventFailures.set(eventName, failureCount + 1);
      return false;
    }

    const passRate = savedEventsCount / handledEventsCount;
    const passed = passRate >= TEST_PASS_RATE;

    if (!passed) {
      logWithTimestamp(`Test for event ${eventName} failed: pass rate ${passRate.toFixed(2)} (expected ${TEST_PASS_RATE}).`);
      this.eventFailures.set(eventName, failureCount + 1);
    }

    logWithTimestamp(`Test for event ${eventName} ${passed ? 'passed' : 'failed'}.`);
    return passed;
  }

  async showStats(syncTimelineSeconds: number = 10): Promise<Map<T, Boolean>> {
    const testPassed: Map<T, Boolean> = new Map();
    const syncInterval = Math.max(Math.floor(syncTimelineSeconds / 5), 1);

    console.log("-–––––- INCREMENTAL RESULTS -–––––-");

    while (syncTimelineSeconds > 0) {
      if (syncTimelineSeconds % syncInterval === 0) {
        await awaitTimeout(1000);
        this.eventNames.forEach((eventName) => {
          const result = this.checkEventWithHandlerAndRepository(eventName);
          testPassed.set(eventName, result);
        });
      }
      syncTimelineSeconds--;
    }

    console.log("-–––––- OVERALL RESULTS -–––––-");

    this.eventNames.forEach((eventName) => {
      const firedEventsCount = this.eventsCount.get(eventName) || 0;
      const handledEventsCount = this.handler.getStats(eventName) || 0;
      const savedEventsCount = this.repository.getStats(eventName) || 0;

      if (firedEventsCount === handledEventsCount && savedEventsCount >= TEST_PASS_RATE * handledEventsCount) {
        logWithTimestamp(`Final Result: ${eventName} PASSED.`);
        testPassed.set(eventName, true);
      } else {
        logWithTimestamp(`Final Result: ${eventName} FAILED. Fired: ${firedEventsCount}, Handled: ${handledEventsCount}, Saved: ${savedEventsCount}`);
        testPassed.set(eventName, false);
      }
    });

    return testPassed;
  }
}