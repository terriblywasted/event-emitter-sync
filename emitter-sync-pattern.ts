/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventDelayedRepository } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { awaitTimeout, triggerRandomly} from "./utils";

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

enum EventRepositoryError {
  TOO_MANY = "Too many requests",
  RESPONSE_FAIL = "Response delivery fail",
  REQUEST_FAIL = "Request fail",
}

class EventHandler extends EventStatistics<EventName> {
  // Feel free to edit this class

  repository: EventRepository;
  emitter: EventEmitter<EventName>;

  private readonly eventsStorage: Map<EventName, VoidFunction>;

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.emitter = emitter;
    this.repository = repository;
    this.eventsStorage = new Map();

    this.subscribe();
  }

  subscribe() {
    EVENT_NAMES.forEach((eventName) => {
      const handler = () => this.saveStats(eventName);
      this.eventsStorage.set(eventName, handler);
      this.emitter.subscribe(eventName, handler);
    });
  }

  saveStats(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
    this.repository.saveEventData(eventName, 1);
  }

  unsubscribe() {
    for (let [eventName, handler] of this.eventsStorage.entries()) {
      this.emitter.unsubscribe(eventName, handler);
    }
  }
}

type Queue = Array<{ eventName: EventName, data: number }>;

class EventRepository extends EventDelayedRepository<EventName> {
  // Feel free to edit this class

  private readonly RETRY_DELAY_MS = 300;
  private lastRequestDateCommon: number;

  private queueStorage: Map<EventName, Queue> = new Map();
  private readonly localEvents: Record<EventName, number>;
  private readonly repoEvents: Record<EventName, number>;
  private readonly isProcessing: Record<EventName, number>;
  private readonly pointers: Record<EventName, number>;
  private readonly lastRequestStorage: Record<EventName, number>;

  constructor() {
    super();
    this.lastRequestDateCommon = new Date().getTime();

    const storage = Object.fromEntries(EVENT_NAMES.map((eventName) => [eventName, 0])) as Record<EventName, number>;

    this.localEvents = {...storage};
    this.repoEvents = {...storage};
    this.isProcessing = {...storage};
    this.pointers = {...storage};
    this.lastRequestStorage = {...storage};
    EVENT_NAMES.forEach(eventName => this.queueStorage.set(eventName, []));

    this.updateEventStatsBy(EventName.EventA, 0).catch(() => {});
  }

  async addToQueue(eventName: EventName, data: number) {
    this.queueStorage.get(eventName)?.push({eventName, data});
    this.localEvents[eventName] += data;
    this.processQueue(eventName);
  }

  async processQueue(eventName: EventName) {
    const queue = this.queueStorage.get(eventName)!;

    if (this.isProcessing[eventName] || this.pointers[eventName] >= queue.length) {
      return;
    }

    this.isProcessing[eventName] = 1;

    while (this.pointers[eventName] < queue.length) {
      const item = queue[this.pointers[eventName]]!;
      this.pointers[eventName]++;
      let diff = 0;

      try {
        const result = await this.updateEventStats(item.eventName);
        if (!result) continue;
        const {diff: payload, promise} = result;
        diff = payload;
        await promise;

      } catch (error) {
        switch (error) {
          case EventRepositoryError.TOO_MANY:
          case EventRepositoryError.REQUEST_FAIL:
            this.pointers[eventName]--;
            this.repoEvents[eventName] -= diff;
            break;
          default:
            break;
        }
      }
    }

    this.queueStorage.set(eventName, []);
    this.pointers[eventName] = 0;

    this.isProcessing[eventName] = 0;
  }

  async updateEventStats(eventName: EventName) {
    const now = new Date();

    if (this.RETRY_DELAY_MS > now.getTime() - this.lastRequestStorage[eventName]) {
      return;
    }

    const waitTime = this.RETRY_DELAY_MS - (now.getTime() - this.lastRequestDateCommon);
    await awaitTimeout(waitTime);

    this.lastRequestStorage[eventName] = new Date().getTime();
    this.lastRequestDateCommon = new Date().getTime();

    const diff = this.localEvents[eventName] - this.repoEvents[eventName];
    this.repoEvents[eventName] += diff;
    return Promise.resolve({diff, promise: this.updateEventStatsBy(eventName, diff)});
  }

  async saveEventData(eventName: EventName, stats: number): Promise<any> {
    await this.addToQueue(eventName, stats);
  }
}

init();
