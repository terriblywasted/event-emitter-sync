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
  // Feel free to edit this class

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
    this.repository.saveData(eventName, count);
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  // Feel free to edit this class
  private savedEvents: { [key: string]: number } = {};
  timer: ReturnType<typeof setTimeout> | null;

  async saveData(eventName: EventName, counter: number) {
    const prevCount = this.savedEvents[eventName] || 0;
    this.savedEvents[eventName] = prevCount + counter;

    if (!this.timer) {
      this.process(eventName);
    }
  }
  async process(processedEventName: EventName) {
    this.timer = null;
    if (Object.keys(this.savedEvents).length === 0) return;

    const batched = this.savedEvents[processedEventName] || 0;
    delete this.savedEvents[processedEventName];

    const newEventName =
      processedEventName === EventName.EventA
        ? EventName.EventB
        : EventName.EventA;

    this.timer = setTimeout(() => {
      this.process(newEventName);
    }, EVENT_SAVE_DELAY_MS);

    try {
      await this.updateEventStatsBy(processedEventName, batched);
    } catch (e) {
      const error = e as EventRepositoryError;
      if (
        error === EventRepositoryError.REQUEST_FAIL ||
        error === EventRepositoryError.TOO_MANY
      ) {
        this.saveData(processedEventName, batched);
      }
    }
  }
}

init();
