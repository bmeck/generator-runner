# generator-runner
its like a more generic task.js

```
generatorRunner(function* task(step) {
  //
  // yield to async tasks ...
  //
  return 'ret';
}, function (err, ret) {
})
```

yielding various values does slightly different things:

## function runner

```
[...values] = yield function (next/*(err, value)*/) {
  // perform async and call next
}
```

* causes an error at the point of yield if `err` is truthy
* returns the `value` for the yield expression 

## disjoint function runner

this uses the `step` function passed into the generator

```
// setup async function to run but not be completed
// synchronously
// such as `setTimeout(step, 0);`
yield step // tell the runner to wait on step to be called
```

## promise runner

```
yield my_promise
```

will use the resolved value to throw an error on rejection or return a value on fulfillment

## generator instance running


```
function* subtask() {
  yield function (next) { setTimeout(next); };
}
yield subtask();
```

## parallel array runner

we can aggregate any value we want to run into an array to run them in parallel and return an array of values

```
[timeout, promise_result] = yield [
  _ => setTimeout(_, 1e3), // wait a second
  my_promise
]
``` 

order of values is preserved so you do not need to worry about which task ends first

## parallel object runner

we can aggregate any value we want to run into an object to run them in parallel and return an object of values

```
timeouts = yield {
  timeout1: _ => setTimeout(_)
  timeout2: _ => setTimeout(_)
}
```

## nesting

since we do allow *any* valid value to be placed inside of our parallel object runners, we can setup specific parallelism using nesting

```
[timeouts, promises] = yield [
  [
    _ => setTimeout(_),
    _ => setTimeout(_)
  ],
  [
    my_promise
  ]
]
```

## limited concurrency

doing limited concurrency is actually a lot of book keeping, so we provide a simple function for making your parallel tasks easier

this only works with array style parallelism

```
concurrency = require('generator-runner').concurrent;
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
