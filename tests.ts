import { EventEmitter } from "./emitter";
import { EventStatistics } from "./event-statistics";
import { ResultsTester } from "./results-tester";
import { triggerRandomly } from "./utils";

enum EventName {
  EventSuccess = "Success",
  EventFail = "Fail",
}

const EVENT_NAMES = [EventName.EventSuccess, EventName.EventFail];

function assertItWorks() {
  const emitter = new EventEmitter<EventName>();

  triggerRandomly(() => emitter.emit(EventName.EventSuccess), 300);
  triggerRandomly(() => emitter.emit(EventName.EventFail), 300);

  const repository = new EventStatistics<EventName>();
  const handler = new EventStatistics<EventName>();

  emitter.subscribe(EventName.EventSuccess, () => {
    handler.setStats(
      EventName.EventSuccess,
      handler.getStats(EventName.EventSuccess) + 1
    );
    repository.setStats(
      EventName.EventSuccess,
      repository.getStats(EventName.EventSuccess) + 1
    );
  });

  emitter.subscribe(EventName.EventFail, () => {
    handler.setStats(
      EventName.EventFail,
      handler.getStats(EventName.EventFail) + 1
    );
  });

  const resultsTester = new ResultsTester({
    eventNames: EVENT_NAMES,
    emitter,
    handler,
    repository,
  });

  resultsTester.showStats().then((map) => {
    const successFired = handler.getStats(EventName.EventSuccess);
    const failFired = handler.getStats(EventName.EventFail);

    if (map.get(EventName.EventSuccess) !== true) {
      throw new Error(`Assert failure: EventSuccess expected true, but got false. Fired: ${successFired}`);
    }
    if (map.get(EventName.EventFail) !== false) {
      throw new Error(`Assert failure: EventFail expected false, but got true. Fired: ${failFired}`);
    }

    console.log("Tests finished successfully");
  });
}

assertItWorks();