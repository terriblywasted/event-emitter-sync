/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EVENT_SAVE_DELAY_MS, EventDelayedRepository, EventRepositoryError } from "./event-repository";
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
        this.saveEvent(eventName);
        this.saveEventToRepository(eventName);
      });
    });
  }

  saveEvent(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
  }

  saveEventToRepository(eventName: EventName) {
    this.repository.saveData(eventName, 1);
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  // Feel free to edit this class
  private queue: { [key: string]: number } = {};
  timer: ReturnType<typeof setTimeout> | null;

  async saveData(eventName: EventName, counter: number) {
    const prevCount = this.queue[eventName] || 0;
    this.queue[eventName] = prevCount + counter;

    if (!this.timer) {
      this.processQueue();
    }
  }
  async processQueue() {
    this.timer = null;
    if (Object.keys(this.queue).length === 0) return;
    const events = Object.entries(this.queue);

    let maxCount = 0;
    let eventNameMax: EventName | "" = "";
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      if (!event) continue;
      if (event[1] > maxCount) {
        maxCount = event[1];
        eventNameMax = event[0] as EventName;
      }
    }

    if (eventNameMax === "") return;

    const eventsCount = this.queue[eventNameMax];

    if (!eventsCount) return;

    delete this.queue[eventNameMax];

    this.timer = setTimeout(() => {
      this.processQueue();
    }, EVENT_SAVE_DELAY_MS + 1);

    try {
      await this.updateEventStatsBy(eventNameMax, eventsCount);
    } catch (e) {
      const error = e as EventRepositoryError;

      if (error === EventRepositoryError.REQUEST_FAIL || error === EventRepositoryError.TOO_MANY) {
        this.saveData(eventNameMax, eventsCount);
      }
    }
  }
}
init();
