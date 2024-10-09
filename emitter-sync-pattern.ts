/* Check the comments first */

import { EventEmitter } from "./emitter";
import { EventDelayedRepository, EventRepositoryError } from "./event-repository";
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

// This solution uses queues and promises to process events sequentially, 
// ensuring proper synchronization between local stats and the repository.
class EventHandler extends EventStatistics<EventName> {
  private repository: EventRepository;
  private emitter: EventEmitter<EventName>;
  private eventQueue: Record<EventName, Promise<void>> = {
    [EventName.EventA]: Promise.resolve(),
    [EventName.EventB]: Promise.resolve(),
  };

  constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
    super();
    this.repository = repository;
    this.emitter = emitter;

    this.subscribe();
  }

  private subscribe() {
    EVENT_NAMES.forEach(event => {
      this.emitter.subscribe(event, this.handleEvent(event));
    });
  }

  private handleEvent(eventName: EventName) {
    return () => {
      this.incrementStats(eventName);
      this.addToQueue(eventName);
    };
  }

  private incrementStats(eventName: EventName) {
    this.setStats(eventName, this.getStats(eventName) + 1);
  }

  private addToQueue(eventName: EventName) {
    this.eventQueue[eventName] = this.eventQueue[eventName].then(() =>
      this.syncWithRepository(eventName)
    );
  }

  private async syncWithRepository(eventName: EventName) {
    try {
      await this.repository.saveEventData(eventName, 1); 
    } catch (error) {
      console.warn(`Ошибка синхронизации для ${eventName}: ${error.message}`);
    }
  }
}

class EventRepository extends EventDelayedRepository<EventName> {
  async saveEventData(eventName: EventName, value: number) {
    try {
      await this.updateEventStatsBy(eventName, value);
    } catch (e) {
      const _error = e as EventRepositoryError;
      console.error("Error saving event data:", {
        eventName,
        value,
        message: _error,
      });

      throw new Error(`Failed to save event data for ${eventName}: ${_error}`);
     }
  }

  async updateEventStatsBy(eventName: EventName, value: number) {
    try {
      this.setStats(eventName, this.getStats(eventName) + value);
    } catch (e) {
      const _error = e as EventRepositoryError;
      console.error("Error updating event stats:", {
        eventName,
        value,
        message: _error,
      });
      
      throw new Error(`Failed to update stats for ${eventName}: ${_error}`);
    }
  }
}

init();

// This solution uses async/await with direct event handling, 
// syncing stats and repository for each event as it occurs.

// class EventHandler extends EventStatistics<EventName> {
//   private repository: EventRepository;
//   private emitter: EventEmitter<EventName>;

//   constructor(emitter: EventEmitter<EventName>, repository: EventRepository) {
//       super();
//       this.repository = repository;
//       this.emitter = emitter;

//       this.subscribe();
//   }

//   private subscribe() {
//       EVENT_NAMES.forEach(event => {
//           this.emitter.subscribe(event, this.handleEvent(event));
//       });
//   }

//   private handleEvent(eventName: EventName) {
//       return async () => {
//           this.incrementStats(eventName);
//           await this.syncWithRepository(eventName, 1);
//       };
//   }

//   private incrementStats(eventName: EventName) {
//       this.setStats(eventName, this.getStats(eventName) + 1);
//   }

//   private async syncWithRepository(eventName: EventName, value: number) {
//       try {
//           await this.repository.saveEventData(eventName, value);
//       } catch (error) {
//           console.warn(`Error saving data for event ${eventName}: ${error.message}`);
//       }
//   }
// }

// class EventRepository extends EventDelayedRepository<EventName> {
//   async saveEventData(eventName: EventName, _: number) {
//       try {
//           await this.updateEventStatsBy(eventName, 1);
//       } catch (e) {
//         const _error = e as EventRepositoryError;
//         console.warn(_error);
//       }
//   }

//   async updateEventStatsBy(eventName: EventName, value: number) {
//       this.setStats(eventName, this.getStats(eventName) + value);
//   }
// }

// init();

