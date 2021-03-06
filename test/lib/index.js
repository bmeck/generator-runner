var runner = require('../../');
var assert = require('assert');

var counted = {};
function counter(k, fn, ...prefixargs) {
  counted[k] = counted[k] || 0;
  counted[k]++;
  console.log(k);
  return fn.apply(this, prefixargs);
}

var ret;
function* task(step, abort) {
  let disjoint_ret = {};
  setTimeout(_ => counter('disjoint', step, null, disjoint_ret));
  let disjoint_out = yield step;
  assert(disjoint_ret == disjoint_out);

  setTimeout(_ => counter('disjoint', step, null, disjoint_ret));
  disjoint_out = yield step;
  assert(disjoint_ret == disjoint_out);

  let callback_ret = {};
  let callback_out = yield _ => setTimeout($ => counter('callback', _, null, callback_ret));
  assert(callback_out == callback_ret);


  let parallel_arr_ret = [{},{}];
  let parallel_arr_out = yield [
    _ => setTimeout($ => counter('parallel_arr', _, null, parallel_arr_ret[0])),
    _ => setTimeout($ => counter('parallel_arr', _, null, parallel_arr_ret[1]))
  ]
  assert(parallel_arr_ret.length == parallel_arr_out.length);
  parallel_arr_out.forEach((v,i) => {
    assert(v == parallel_arr_ret[i]);
  });

  let parallel_key_ret = {
    a: {},
    b: {}
  };
  let parallel_key_out = yield {
    a: _ => setTimeout($ => counter('parallel_key', _, null, parallel_key_ret.a)),
    b: _ => setTimeout($ => counter('parallel_key', _, null, parallel_key_ret.b)),
    c: _ => setTimeout($ => counter('parallel_key', _, null, parallel_key_ret.c))
  }
  for (var k in parallel_key_ret) {
    assert(parallel_key_ret[k] == parallel_key_out[k], k + ' to be the same');
  } 
  // need to check both (easier than checking keys  are the same in case of prototype changes)
  for (var k in parallel_key_out) {
    assert(parallel_key_ret[k] == parallel_key_out[k], k + ' to be the same');
  } 

  let subtask_ret = {};
  let subtask = function* () {
    yield _ => setTimeout($ => counter('subtask', _, null));
    yield _ => setTimeout($ => counter('subtask', _, null));
    yield _ => setTimeout($ => counter('subtask', _, null));
    yield _ => setTimeout($ => counter('subtask', _, null));
    return subtask_ret;
  }
  let subtask_out = yield subtask();
  assert(subtask_out == subtask_ret);

  // check the guard
  yield _ => {
    try {
      step();
    }
    catch (e) {
      assert(e);
      counter('guard', _);
      return;
    }
    assert(false);
  };

  // test skipping
  yield null;
  yield undefined;

  // test timing consistency
  let done = 0
  yield [
    _ => {done+=1;_()},
    _ => {done+=1;_()}  
  ]
  assert(done == 2);

  // test concurrency runner
  let running = 0;
  let concurrency = 2;

  function run(_) {
    running += 1;
    assert(running <= concurrency);
    setTimeout($ => {
      running -= 1;
      counter('concurrent', _, null);
    });
  }    
  yield runner.concurrent(concurrency, [
    run,
    run,
    run,
    run,
    run,
    run,
    run,
    run,
    run,
    run,
    run
  ]);

  let race_turtle = new Promise((f,r) => setTimeout($ => counter('race', f), 100));
  let race_ret = {};
  let race_out = yield runner.race({
    fast: _ => setTimeout($ => counter('race', _, null, race_ret)),
    slow: _ => race_turtle,
    never_called: _ => {}
  });
  assert(race_ret == race_out);
  yield race_turtle;

  return ret;
}
var expected = {
  disjoint: 2,
  callback: 1,
  parallel_arr: 2,
  parallel_key: 3,
  subtask: 4,
  guard: 1,
  concurrent: 11,
  race: 2
}
var ran = 0;
process.on('exit', _ => assert(ran == 2), 'the test ran');
// make it run!
runner(task, (err, val) => {
  ran += 1;
  assert(!err, 'there is not an error: ' + err); 
  assert(val == ret, 'the return value is the same reference');
  var expectedKeys = Object.keys(expected).sort();
  var countedKeys = Object.keys(counted).sort();
  assert(expectedKeys.length == countedKeys.length, 'the keys have the same length for expected and counted');
  assert(JSON.stringify(expectedKeys) == JSON.stringify(countedKeys), 'the keys for expected and counted are the same values');
  expectedKeys.forEach(k => {
    assert(expected[k] == counted[k], 'the ' + k + ' key is the same value for expected and counted');
  });
  countedKeys.forEach(k => {
    assert(expected[k] == counted[k], 'the ' + k + ' key is the same value for expected and counted');
  });
});

let abort_ret = {};
runner(function* abort_task(step, abort) {
  try {
    abort();
    assert(false, 'abort without a value should throw');
  }
  catch (e) {
    // haha need a value
    assert(e, 'aborting without a value should throw');
  }
  let done = false;
  setImmediate(_ => {
    done = true;
    abort(abort_ret);
  });
  setImmediate(_ => {
    assert(done, 'we should be done already');
    try {
      // aborting when we are done is not an error
      abort(abort_ret);
    }
    catch (e) {
      assert(false, 'multiple aborts are allowed');
    }
  });
  yield _ => setImmediate($ => {
    try {
      _();
    }
    catch (e) {
      assert(e, 'continuing after an abort is not possible');
    }
  });
}, function (err) {
  ran += 1;
  assert(err == abort_ret, 'aborting causes an error');
});
