# generator-runner

A function scheduler to allow generators to perform asynchronous task scheduling.

```javascript
require('generator-runner')(function* task(step) {
  //
  // yield to async tasks ...
  //
  return 'ret';
}, function (err, ret) {
  // err is truthy if an error was thrown
  // ret is our generator's return value
});
```

In order to perform async tasks we use `yield $task`.

```javascript
require('generator-runner')(function* task(step) {
  let async_task_result = yield async_task;
});
```

If an async task produces an exception we throw an error at that point and we
can use a `try`/`catch` block to handle asynchronous errors.

```javascript
require('generator-runner')(function* task(step) {
  try {
    let async_task_result = yield async_task;
  }
  catch (e) {
    if (cant_recover(e)) throw e;
    else {
      recover_from(e);
    }
  }
}, function (e) {
  // any thrown error will stop execution and invoke this callback
});
```

This is more important than merely `try`/`catch` because we can achieve finally
blocks for cleanup.

```javascript
let file = 'test.txt';
require('generator-runner')(function* task(step) {
  let fd = open(file);
  try {
    // the life of our resource is the length of async_task_with(fd)
    yield async_task_with(fd);
  }
  // we don't need a catch
  finally {
    // this gets called regardless of success or failure
    close(fd);
  }
  
});
```

## function runner

This performs a node style callback async function.
The function is invoked with a callback to continue the generator.
If the first parameter of the callback is truthy an error is thrown.
Otherwise, the second value of the callback is treated as a return value.

```javascript
value = yield function (next/*(err, value)*/) {
  // perform async and call next
}
```

* causes an error at the point of yield if `err` is truthy
* returns the `value` for the yield expression 

## disjoint function runner

This uses the `step` function passed into the generator to continue the
generator.
This is very important for evented style programming where an event listener
has been setup previously and we are just waiting for an event to come in.

```javascript
setTimeout(step, 0);
yield step // tell the runner to wait on step to be called
// setTimeout fires after the yield, and the generator continues
```

## promise runner

Promises map almost directly onto generator's `.next` and `.throw` methods.
Promises do not start any work since they are a data structure only;
instead they will cause an error if rejected or return a value if fulfilled.

```
yield my_promise;
```

* throw an error on rejection 
* return a value on fulfillment

## generator instance running

Generator instances are a series of tasks to be performed.
We can temporarily give control to another generator to perform tasks
for our current generator.

This is not the same as using `yield*` because it produces a step guard
(see below).

```javascript
function* subtask() {
  yield function (next) { setTimeout(next); };
}
yield subtask();
```

## parallel array runner

Yielding an array will result in all the values being run in parallel.
The values follow all of the runners listed here.
Order of values is preserved so you do not need to worry about which task ends
first.

```javascript
let [timeout, promise_result] = yield [
  _ => setTimeout(_, 1e3), // wait a second
  my_promise
];
``` 


## parallel object runner

Similar to arrays when an object is yielded it will produce parallel tasks.

```javascript
let timeouts = yield {
  timeout1: _ => setTimeout(_)
  timeout2: _ => setTimeout(_)
};
```

## nesting

*Any* valid value can be placed inside of our parallel object runners;
we can setup specific parallelism using nesting.

```javascript
let [timeouts, promises] = yield [
  [
    _ => setTimeout(_),
    _ => setTimeout(_)
  ],
  [
    my_promise1,
    my_promise2
  ]
];
```

## racing 

Although not complex, the ability to race for whatever the first task to finish
is a common work flow.
The race function will let you do this.
It accepts either Arrays or Objects, though it will not preserve which index was
the one to finish first.

```javascript
let race = require('generator-runner').race;
yield race({
  timeout: _ => setTimeout(() => _(new Error('timeout!'), 120 * 1000),
  exit: _ => child.on('exit', _),
  error: _ => child.on('error', _)
});
```

## limited concurrency

Doing limited concurrency is actually a lot of book keeping;
we provide a simple function for making your parallel tasks easier.

**NOTE** this only works with array style parallelism.

```javascript
let concurrency = require('generator-runner').concurrent;
yield concurrency(2, [
    _ => setTimeout(_),
    _ => setTimeout(_),
    _ => setTimeout(_),
    _ => setTimeout(_),
    _ => setTimeout(_),
    _ => setTimeout(_),
    _ => setTimeout(_)
]);
```

## step guards

While an async task or parallel task is running any attempt at disjoint
stepping will result in an error to prevent race conditions.

```javascript
// this will fire before our async task
setTimeout(function () {
  try {
    // this throws an error because we are not waiting on `step`
    step();
  }
  catch (e) {
    console.log(`I'm busy~`);
  }
}, 0);
yield _ => setTimeout(_, 1e3);
```
