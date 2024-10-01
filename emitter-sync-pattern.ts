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

  private readonly events: Map<EventName, () => void>;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;
    this.emitter = emitter;
    this.events = new Map();

    this.subscribe();
  }

  subscribe() {
    EVENT_NAMES.map(event => {
      const handler = () => {
        this.setStats(event, this.getStats(event) + 1);
        this.repository.saveEventData(event, 1);
      }
      this.events.set(event, handler);
      this.emitter.subscribe(event, handler);
    });
  }
}

class EventRepository extends EventDelayedRepository<EventName> {

  async saveEventData(eventName: EventName, _: number) {
    try {
      await this.updateEventStatsBy(eventName, 1);
    } catch (e) {
      // const _error = e as EventRepositoryError;
      // console.warn(error);
    }
  }

  async updateEventStatsBy(eventName: EventName, value: number) {
    this.setStats(eventName, this.getStats(eventName) + value);
  }
}

init();
