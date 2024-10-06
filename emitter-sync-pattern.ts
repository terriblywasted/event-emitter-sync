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
  private repository: EventRepository;
  private emitter: EventEmitter<EventName>

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();

    this.repository = repository;
    this.emitter = emitter;

    for (const eventName of EVENT_NAMES) {
      const handler = async () => {
        this.setStats(eventName, this.getStats(eventName) + 1)
        await this.repository.saveEventData(eventName, this.getStats(eventName))
      }
      this.emitter.subscribe(eventName, handler);
    }
  }
}


enum EventRepositoryChangeStatsErrors {
  RESPONSE_FAIL = "Response delivery fail",
}


// Решение с промисами
class EventRepository extends EventDelayedRepository<EventName> {
  private promiseRace: Map<EventName, Array<Promise<number>>>;

  constructor() {
    super();
    this.promiseRace = new Map(EVENT_NAMES.map((event) => [event, []]));
  }

  addPromise(eventName: EventName, value: number) {
    const existingPromises = this.promiseRace.get(eventName) || [];

    const newPromise = new Promise<number>(async (resolve, reject) => {
      try {
        await this.updateEventStatsBy(eventName, value);
        this.promiseRace.set(eventName , []);
        resolve(value);
      } catch (e) {
        // Если статистика репозитория уже обновлена на нужное значение, ресолвим
        if (e === EventRepositoryChangeStatsErrors.RESPONSE_FAIL) {
          resolve(value);
          this.promiseRace.set(eventName , []);
        } else {
          reject(e);
        }
      }
    });

    this.promiseRace.set(eventName, [...existingPromises, newPromise]);
  }

  async saveEventData(eventName: EventName, handlerStats: number) {
    const repoStats = this.getStats(eventName);
    const skippedData = handlerStats - repoStats;

    if(skippedData > 0){
      this.addPromise(eventName, skippedData);
    }
    const promises = this.promiseRace.get(eventName);

    if (promises && promises.length > 0) {
      Promise.any(promises)
          .then(() => {})
          .catch(() => {})
    }
  }
}

// Решение без промисов
// class EventRepository extends EventDelayedRepository<EventName> {
//   private eventProgress: Map<EventName, boolean>
//
//   constructor() {
//     super();
//     this.eventProgress = new Map(EVENT_NAMES.map((event) => [event, false]))
//   }
//
//   async saveEventData(eventName: EventName, handlerStats: number) {
//     const repoStats = this.getStats(eventName)
//     const skippedData = handlerStats - repoStats
//
//     if(this.eventProgress.get(eventName)){
//       return
//     }
//
//     this.eventProgress.set(eventName, true)
//     const retries = 3
//     let attempts = 0
//
//     while(attempts < retries){
//       try {
//         await this.updateEventStatsBy(eventName, skippedData);
//         this.eventProgress.set(eventName, false)
//         return;
//       } catch (e) {
//         attempts++
//         // Если статистика репозитория уже обновлена на нужное значение, выходим
//         if(e === EventRepositoryChangeStatsErrors.RESPONSE_FAIL){
//           this.eventProgress.set(eventName, false)
//           return;
//         }
//       }
//     }
//     this.eventProgress.set(eventName, false)
//   }
// }

init();
