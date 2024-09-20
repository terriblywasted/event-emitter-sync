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

const updateStats = (
  stats: EventStatistics<EventName>,
  event: EventName,
  amount: number
) => stats.setStats(event, stats.getStats(event) + amount);

const rotateArray = <T>(arr: T[]) => {
  let currentIndex = 0;
  return () => {
    const result = arr[currentIndex];
    currentIndex = (currentIndex + 1) % arr.length;
    return result!;
  };
};
const getNextEvent = rotateArray(EVENT_NAMES);

class EventHandler extends EventStatistics<EventName> {
  repository: EventRepository;
  buffer = new EventStatistics<EventName>();
  isUpdateInProgress = false;
  currentEvent = getNextEvent();

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;

    EVENT_NAMES.map((event) =>
      emitter.subscribe(event, () => {
        updateStats(this, event, 1);
        updateStats(this.buffer, event, 1);

        this.scheduleUpdateRepository();
      })
    );
  }

  async updateRepository() {
    this.currentEvent = getNextEvent();
    const amount = this.buffer.getStats(this.currentEvent);
    if (!amount) {
      return;
    }

    this.isUpdateInProgress = true;
    try {
      updateStats(this.buffer, this.currentEvent, -amount);
      await this.repository.updateEventStatsBy(this.currentEvent, amount);
    } catch (e) {
      const error = e as EventRepositoryError;
      if (error === EventRepositoryError.RESPONSE_FAIL) {
        return;
      }
      updateStats(this.buffer, this.currentEvent, amount);
    }
  }

  scheduleUpdateRepository() {
    if (this.isUpdateInProgress) {
      setTimeout(() => {
        this.updateRepository();
        this.isUpdateInProgress = false;
      }, 301);
    } else {
      this.updateRepository();
    }
  }
}

class EventRepository extends EventDelayedRepository<EventName> {}

init();
