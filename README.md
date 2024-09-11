# Sync events with emitter to local and remote repo

The implementation of EventHandler (local repo representation) and EventRepository (remote repo representation) is up to you. Main idea is to subscribe to EventEmitter, save it in local stats along with syncing with EventRepository.

The implementation of EventHandler and EventRepository is flexible and left to your discretion. The primary objective is to subscribe to EventEmitter, record the events in `.eventStats`, and ensure synchronization with EventRepository.

The ultimate aim is to have the `.eventStats` of EventHandler and EventRepository have the same values (and equal to the amount of actual events fired by the emitter) by the time MAX_EVENTS have been fired.

## Run

Check the code first, install deps and the `dev` command could help you with running the code

## Providing results

The best way is to fork this github repo, create pull request with changes and provide a link
