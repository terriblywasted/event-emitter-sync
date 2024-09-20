/* Check the comments first */
import { EventEmitter } from "./emitter";
import {
  EVENT_SAVE_DELAY_MS,
  EventDelayedRepository,
  EventRepositoryError,
} from "./event-repository";
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
  repository: EventRepository;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;

    EVENT_NAMES.forEach((eventName) => {
      emitter.subscribe(eventName, () => this.saveEventData(eventName));
    });
  }

  saveEventData(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
    this.repository.saveEventData(eventName, 1);
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  private batch: Map<EventName, number> = new Map();
  private lastRequest: Date = new Date();

  saveEventData(eventName: EventName, increment: number) {
    this.updateEventBatch(eventName, increment);
    if (this.lastRequest.getTime() + EVENT_SAVE_DELAY_MS < new Date().getTime()) {
      this.sendBatch();
    }
  }

  async sendBatch() {
    const [eventName, eventBatch] = Array.from(this.batch.entries()).reduce((maxItem, item) =>
      maxItem[1] > item[1] ? maxItem : item
    );

    this.updateEventBatch(eventName, -eventBatch);
    this.lastRequest = new Date();

    try {
      await this.updateEventStatsBy(eventName, eventBatch);
    } catch (e) {
      const error = e as EventRepositoryError;

      if (error === EventRepositoryError.REQUEST_FAIL || error === EventRepositoryError.TOO_MANY) {
        this.updateEventBatch(eventName, eventBatch);
      }
    }
  }

  updateEventBatch(eventName: EventName, increment: number) {
    const eventBatch = (this.batch.get(eventName) || 0) + increment;
    this.batch.set(eventName, eventBatch);
  }
}

init();
