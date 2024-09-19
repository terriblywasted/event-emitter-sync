/* Check the comments first */

import {EventEmitter} from "./emitter";
import {EventDelayedRepository, EventRepositoryError} from "./event-repository";
import {EventStatistics} from "./event-statistics";
import {ResultsTester} from "./results-tester";
import {triggerRandomly} from "./utils";

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
    emitter.subscribe(EventName.EventA, () => this.handleEvent(EventName.EventA));
    emitter.subscribe(EventName.EventB, () => this.handleEvent(EventName.EventB));
  }
  private async handleEvent (eventName: EventName) {
    const currentCount = this.getStats(eventName) + 1;
    this.setStats(eventName, currentCount);
    await this.repository.saveEventData(eventName, currentCount);
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  syncData: Record<EventName, number> = {
    [EventName.EventA]: 0,
    [EventName.EventB]: 0,
  };

  async saveEventData(eventName: EventName, count: number) {
    try {
      const dif = count - this.getStats(eventName);
      await this.updateEventStatsBy(eventName, dif > 0 ? dif + this.syncData[eventName]: 1);
      this.syncData[eventName] = 0;
    } catch (e) {
      const error = e as EventRepositoryError;
      if(error === EventRepositoryError.TOO_MANY) {
        this.syncData[eventName]++;
      } else if(error === EventRepositoryError.REQUEST_FAIL) {
        const dif = count - this.getStats(eventName);
        this.syncData[eventName] += dif > 0 ? dif: 1;
      }
    }
  }
}
init();
