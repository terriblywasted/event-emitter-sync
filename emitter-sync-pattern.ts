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
  // Feel free to edit this class

  repository: EventRepository;
  emitter: EventEmitter<EventName>;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;
    this.emitter = emitter;
    this.subscribeEvents();
  }

  private subscribeEvents() {
    EVENT_NAMES.forEach((eventName) => {
      this.emitter.subscribe(eventName, async () => {
        await this.saveEventData(eventName);
      });
    });
  }

  private async saveEventData(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
    await this.repository.saveEventData(eventName, 1);
  }
}

enum EventRepositoryError {
  TOO_MANY = "Too many requests",
  RESPONSE_FAIL = "Response delivery fail",
  REQUEST_FAIL = "Request fail",
}

class EventRepository extends EventDelayedRepository<EventName> {
  private eventBatch: { name: EventName; count: number }[] = [];
  private batchingDelay: number = 300;

  constructor() {
    super();
    setInterval(() => this.flushBatch(), this.batchingDelay);
  }

  async saveEventData(eventName: EventName, count: number) {
    const existingEvent = this.eventBatch.find(
        (event) => event.name === eventName,
    );
    if (existingEvent) {
      existingEvent.count += count;
    } else {
      this.eventBatch.push({ name: eventName, count });
    }
  }

  private async flushBatch() {
    if (this.eventBatch.length === 0) return;
    while (this.eventBatch.length !== 0) {
      const event = this.eventBatch.shift();
      if (event) {
        try {
          await this.updateEventStatsBy(event.name, event.count);
        } catch (e) {
          const error = e as EventRepositoryError;
          switch (error) {
            case EventRepositoryError.REQUEST_FAIL:
            case EventRepositoryError.TOO_MANY:
              this.eventBatch.unshift(event);
              break;
            case EventRepositoryError.RESPONSE_FAIL:
              break;
          }
        }
      }
    }
  }
}

init();
