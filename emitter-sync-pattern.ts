/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EVENT_SAVE_DELAY_MS, EventDelayedRepository, EventRepositoryError } from "./event-repository";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { triggerRandomly } from "./utils";

const MAX_EVENTS = 1000;
const BATCH_SIZE = 100;

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
  eventQueue: { eventName: EventName; count: number; retryCount: number }[] = [];
  queueProcessingInterval : number;
  maxRetries = 3; 

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;
    this.queueProcessingInterval  = EVENT_SAVE_DELAY_MS;

    for (const eventName of EVENT_NAMES) {
      emitter.subscribe(eventName, () => {
        this.setStats(eventName, this.getStats(eventName) + 1);
        this.addToQueue(eventName);
      });
    }

    this.startQueueProcessing();
  }

  addToQueue(eventName: EventName) {
    const existingEvent = this.eventQueue.find(item => item.eventName === eventName && item.retryCount === 0);
    if (existingEvent) {
      existingEvent.count += 1;
    } else {
      this.eventQueue.push({ eventName, count: 1, retryCount: 0 });
    }
  }

  async startQueueProcessing() {
    const process = async () => {
      if (this.eventQueue.length > 0) {
        await this.processQueue();
      }
      setTimeout(process, this.queueProcessingInterval );
    };
    process();
  }

  async processQueue() {
    const batch = this.eventQueue.splice(0, BATCH_SIZE);
    const batchMap: { [key in EventName]: number } = {
      [EventName.EventA]: 0,
      [EventName.EventB]: 0,
    };

    for (const { eventName, count } of batch) {
      batchMap[eventName] += count;
    }

    await Promise.all(EVENT_NAMES.map(async (eventName) => {
      if (batchMap[eventName] > 0) {
        try {
          await this.repository.saveEventData(eventName, batchMap[eventName]);
        } catch (e) {
          batch
            .filter(item => item.eventName === eventName)
            .forEach(item => {
              if (item.retryCount < this.maxRetries) {
                this.eventQueue.push({ 
                  eventName: item.eventName, 
                  count: item.count, 
                  retryCount: item.retryCount + 1 
                });
              } else {
                console.error(`Max retry limit reached for event: ${eventName}`);
              }
            });
        }
      }
    }));
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  async saveEventData(eventName: EventName, count: number) {
    try {
      await this.setStats(eventName, this.getStats(eventName) + count);
    } catch (e) {
      const error = e as EventRepositoryError;
      console.warn(error);
    }
  }
}

init();
