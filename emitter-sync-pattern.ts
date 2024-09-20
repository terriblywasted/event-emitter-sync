/* Check the comments first */

import { EventEmitter } from "./emitter";
import {EventDelayedRepository} from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { triggerRandomly} from "./utils";

const MAX_EVENTS = 1000;

enum EventName {
  EventA = "A",
  EventB = "B",
}

const EVENT_NAMES = [EventName.EventA, EventName.EventB];

enum EventRepositoryError {
  TOO_MANY = "Too many requests",
  RESPONSE_FAIL = "Response delivery fail",
  REQUEST_FAIL = "Request fail",
}

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

    EVENT_NAMES.map((event) => {
      emitter.subscribe(event, async () => {
        await this.handleEvent(event)
      });
    })
  }

  async handleEvent(event: EventName) {
    const payload = (this.getStats(event) || 0) + 1
    this.setStats(event, payload);
    await this.repository.saveEventData(event, payload)
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  // Feel free to edit this class
  private syncEventsData: Map<EventName, number> = new Map([
    [EventName.EventA, 0],
    [EventName.EventB, 0]
  ])

  private increaseSyncData(eventName: EventName) {
    this.syncEventsData.set(eventName, (this.syncEventsData.get(eventName) || 0) + 1)
  }

  async saveEventData(eventName: EventName, eventCount: number) {
    const delta = eventCount - this.getStats(eventName)

    const payload = delta > 0 ? delta + (this.syncEventsData.get(eventName) || 0) : 1

    try {
      await this.updateEventStatsBy(eventName, payload)

      this.syncEventsData.set(eventName, 0)
    } catch (e) {
      const _error = e as EventRepositoryError;

      switch (_error) {
        case EventRepositoryError.REQUEST_FAIL:
          await this.saveEventData(eventName, eventCount)
          break
        case EventRepositoryError.RESPONSE_FAIL:
          break
        case EventRepositoryError.TOO_MANY:
          this.increaseSyncData(eventName)
          break
      }
    }
  }
}

init();
