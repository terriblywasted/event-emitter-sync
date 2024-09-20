/* Check the comments first */

import { EventEmitter } from "./emitter";
import {
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
  private _repository: EventRepository;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this._repository = repository;

    for (let eventName of EVENT_NAMES) {
      emitter.subscribe(eventName, () => this._handleEvent(eventName));
    }
  }

  private _handleEvent(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
    this._repository.saveEventData(eventName, this.getStats(eventName));
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  private _deltas = new DeltasController();

  async saveEventData(eventName: EventName, handlerEvents: number) {
    try {
      let payload = 1;

      if (this._deltas.get(eventName) > 0) {
        payload =
          handlerEvents -
          this.getStats(eventName) +
          this._deltas.get(eventName);
      }

      await this.updateEventStatsBy(eventName, payload);
      this._deltas.clear(eventName);
    } catch (error) {
      switch (error) {
        case EventRepositoryError.RESPONSE_FAIL:
          this._deltas.clear(eventName);
          break;
        case EventRepositoryError.REQUEST_FAIL:
          this.saveEventData(eventName, handlerEvents);
        case EventRepositoryError.TOO_MANY:
          this._deltas.update(eventName, this._deltas.get(eventName) + 1);
      }
    }
  }
}

class DeltasController {
  private _cache: Map<EventName, number> = new Map([]);

  get(eventName: EventName) {
    return this._cache.get(eventName) || 0;
  }

  update(eventName: EventName, value: number) {
    this._cache.set(eventName, value);
  }

  clear(eventName: EventName) {
    this._cache.delete(eventName);
  }
}

init();
