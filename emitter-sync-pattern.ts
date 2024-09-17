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
      emitter.subscribe(eventName, () => {
        this.saveEvent(eventName, 1);
        this.saveEventToRepository(eventName, 1);
      });
    });
  }

  saveEvent(eventName: EventName, count: number) {
    this.setStats(eventName, this.getStats(eventName) + count);
  }

  saveEventToRepository(eventName: EventName, count: number) {
    this.repository.saveEventData(eventName, count);
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  private queue: Record<string, number>[] = [];
  isA = true;
  timer: ReturnType<typeof setTimeout> | null;

  constructor() {
    super();
  }

  async saveEventData(passedEventName: EventName, counter: number) {
    this.queue.push({ [passedEventName]: counter });
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.proccessQueue();
      })
    }
  }

  async proccessQueue() {
    this.timer = null;
    if (this.queue.length === 0) return;

    this.isA = !this.isA;
    const eventName = this.isA ? EventName.EventA : EventName.EventB;
    const batched = this.queue
      .filter((item) => eventName in item)
      .reduce((acc, val) => acc + val[eventName]!, 0);
    this.queue = this.queue.filter((item) => !(eventName in item));

    this.timer = setTimeout(() => {
      this.proccessQueue()
    }, EVENT_SAVE_DELAY_MS);

    try {
      await this.updateEventStatsBy(eventName, batched);
    } catch (e) {
      const error = e as EventRepositoryError;
      if (
        error === EventRepositoryError.REQUEST_FAIL ||
        error === EventRepositoryError.TOO_MANY
      ) {
        this.saveEventData(eventName, batched);
      }
    }
  }
}

init();
