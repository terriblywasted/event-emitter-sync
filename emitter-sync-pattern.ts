/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventDelayedRepository } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { awaitTimeout, triggerRandomly } from "./utils";

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
  repository: EventRepository;
  intervalRequest: NodeJS.Timeout;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;

    EVENT_NAMES.forEach(eventName => {
      emitter.subscribe(eventName, this.handleEvent(eventName));
    });

    this.intervalRequest = setInterval(this.throttle(() => this.syncWithRepository(), 1000))
  }

  private handleEvent(eventName: EventName) {
    return () => {
      this.setStats(eventName, this.getStats(eventName) + 1);
    };
  }

  private throttle<T extends (...args: any[]) => void>(callback: T, time: number): (...args: Parameters<T>) => void {
    let lastCall = 0;
    
    return (...args: Parameters<T>) => {
      const now = Date.now();
      if (now - lastCall >= time) {
        lastCall = now;
        callback(...args);
      }
    };
  }

  private async syncWithRepository() {
    for (const eventName of EVENT_NAMES) {
      await awaitTimeout(300);
      this.repository.syncWithRepository(eventName, this.getStats(eventName)).catch((error) => {
        console.error(error);
      })
      if (this.getStats(eventName) >= MAX_EVENTS) {
        clearInterval(this.intervalRequest);
      }
    }
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  async syncWithRepository(eventName: EventName, by: number) {
    const count = by - this.getStats(eventName)
    return this.updateEventStatsBy(eventName, count);
  }
}

init();
