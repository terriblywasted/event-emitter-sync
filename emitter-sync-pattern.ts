/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventDelayedRepository } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { triggerRandomly } from "./utils";

const MAX_EVENTS = 1000;

enum EventName {
  EventA = "A",
  EventB = "B",
}

const EVENT_NAMES = [EventName.EventA, EventName.EventB];

/*

  An initial configuration for this case

*/

function init() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventA), MAX_EVENTS);
  triggerRandomly(() => emitter.emit(EventName.EventB), MAX_EVENTS);

  const repository = new EventRepository();
  const handler = new EventHandler(emitter, repository);

  const resultsTester = new ResultsTester({
    eventNames: EVENT_NAMES,
    emitter,
    handler,
    repository,
  });
  resultsTester.showStats(20);
}

/* Please do not change the code above this line */
/* ----–––––––––––––––––––––––––––––––––––––---- */

/*

  The implementation of EventHandler and EventRepository is up to you.
  Main idea is to subscribe to EventEmitter, save it in local stats
  along with syncing with EventRepository.

  The implementation of EventHandler and EventRepository is flexible and left to your discretion.
  The primary objective is to subscribe to EventEmitter, record the events in `.eventStats`,
  and ensure synchronization with EventRepository.

  The ultimate aim is to have the `.eventStats` of EventHandler and EventRepository
  have the same values (and equal to the actual events fired by the emitter) by the
  time MAX_EVENTS have been fired.

*/

class EventHandler extends EventStatistics<EventName> {
  repository: EventDelayedRepository<EventName>;
  private syncIntervalA: ReturnType<typeof setInterval>;
  private syncIntervalB: ReturnType<typeof setInterval>;
  private throttledSyncA: (...args: any[]) => void;
  private throttledSyncB: (...args: any[]) => void;

  constructor(emitter: EventEmitter<EventName>, repository: EventDelayedRepository<EventName>) {
    super();
    this.repository = repository;

    // Подписываемся на события
    emitter.subscribe(EventName.EventA, () => this.handleEvent(EventName.EventA));
    emitter.subscribe(EventName.EventB, () => this.handleEvent(EventName.EventB));

    setTimeout(() => {
      this.syncWithRepository(EventName.EventA);
      this.syncWithRepository(EventName.EventB);
    }, 100);

    this.throttledSyncA = this.throttle(() => this.syncWithRepository(EventName.EventA), 300);
    this.throttledSyncB = this.throttle(() => this.syncWithRepository(EventName.EventB), 300);

    this.syncIntervalA = setInterval(this.throttledSyncA, 300);
    this.syncIntervalB = setInterval(this.throttledSyncB, 300);
  }

  private handleEvent(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
  }

  private async syncWithRepository(eventName: EventName) {
    const count = this.getStats(eventName);
    const repoCount = this.repository.getStats(eventName);
    const toSync = count - repoCount;

    if (toSync > 0) {
      try {
        await this.syncWithRetries(eventName, toSync);
      } catch (error) {

      }
    }
  }

  private throttle(fn: (...args: any[]) => void, delay: number) {
    let lastCall = 0;
    return (...args: any[]) => {
      const now = new Date().getTime();
      if (now - lastCall >= delay) {
        lastCall = now;
        fn(...args);
      }
    };
  }

  private async syncWithRetries(eventName: EventName, count: number, retries = 3) {
    let attempt = 0;
    while (attempt < retries) {
      try {
        await this.repository.updateEventStatsBy(eventName, count);
        break;
      } catch (error) {
        if (error === "Too many requests") {
          attempt++;
          await this.delay(100); 
        } else {
          throw error;
        }
      }
    }
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stopSync() {
    clearInterval(this.syncIntervalA);
    clearInterval(this.syncIntervalB);
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  async saveEventData(eventName: EventName, increment: number) {
    try {
      await this.updateEventStatsBy(eventName, increment);
    } catch (error) {
     
    }
  }
}

init();
