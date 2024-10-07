/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventRepositoryError, EventDelayedRepository } from "./event-repository";
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

  private repository: EventRepository;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;

    for (let name of EVENT_NAMES) {
      emitter.subscribe(name, async () => {
        await this.repository.saveEventData(name, 1)
        this.setStats(name, this.getStats(name) + 1)
      } 
      );
    }
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  // Feel free to edit this class

  private counter: number = 0

  async saveEventData(eventName: EventName, count: number) {
    const stats = this.getStats(eventName)
    try {
      await this.updateEventStatsBy(eventName, count + this.counter);
      if (stats + count !== this.getStats(eventName)) {
        this.counter = (stats + count) - this.getStats(eventName)
      } else {
        this.counter = 0
      }


    } catch (e) {
      const error = e as EventRepositoryError;
      console.warn(error);
    }
  }
}

init();
