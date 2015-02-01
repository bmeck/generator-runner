function toCallback(value, options) {
  // console.log('toCallback', value)
  if (value && typeof value.next == 'function') {
    return function (next) {
      runner(function (step) {
        return value;
      }, next);
    }
  }
  if (typeof value === 'function') {
    return value;
  }
  else if (value && typeof value.then === 'function') {
    return function (next) {
      value.then(
        v=>{next(null, v)},
        e=>{next(e, null)}
      )
    };
  }
  else if (Array.isArray(value)) {
    let steps = value.map(toCallback);
    let results = new Array(steps.length);
    // GC cleanup
    value = null;
    let todo = steps.length;
    return function (next) {
      function tick(err) {
        if (todo <= 0) return;
        if (err) {
          todo = 0;
          next(err);
          return;
        }
        todo--;
        if (todo == 0) {
          next(null, results);
        }
      }
      steps.forEach(function (step, i) {
        let done = false;
        step(function (err, result) {
          if (done) return;
          done = true;
          results[i] = result;
          tick(err);
        })
      });
    }
  }
  else if (value && typeof value === 'object') {
    let steps = [];
    let results = Object.create(null);
    let todo = 0;
    for (let key in value) {
      todo += 1;
      steps.push(function (next) {
        toCallback(value[key])(function (err, value) {
          results[key] = value;
          next(err);
        });
      });
    }
    return function (next) {
      function tick(err) {
        if (todo <= 0) return;
        if (err) {
          todo = 0;
          next(err);
          return;
        }
        todo--;
        if (todo == 0) {
          next(null, results);
        }
      }
      for (let step of steps) {
        step(tick);
      }
    }
  }
  else {
    throw new Error('cannot convert to callback');
  }
}
function runner(generator_fn, cb) {
  let done;
  let first = true;
  let waiting_already = false;
  function step(err, args) {
    args = Array.prototype.slice.call(arguments, 1);
    // console.log('step', err, args)
    let result;
    let value;
    if (done) throw new Error('already done');
    if (waiting_already) throw new Error('already waiting');
    try {
      if (err) {
        result = generator.throw(err);
      }
      else {
        // lol es-discuss
        if (first) {
          first = false;
          result = generator.next();
        }
        else result = generator.next(...args);
      }
      value = result.value;
      done = result.done;
    }
    catch (e) {
      done = true;
      cb && cb(e, null);
      return;
    }
    if (done) {
      cb && cb(null, value);
    }
    else if (value == step) {
      // do nothing, we were told that the generator has stuff setup;
    }
    else if (value == null) {
      generator.next(undefined);
    }
    else {
      waiting_already = true;
      let fn;
      try {
        fn = toCallback(value);
      }
      catch (e) {
        done = true;
        cb && cb(e, null);
        return;
      }
      let performed = false;
      fn((...args) => {
        if (performed) throw new Error('already performed this step');
        performed = true;
        waiting_already = false;
        step(...args);
      });
    }
  }
  let generator = generator_fn(step);
  step();
}
module.exports = runner;


function concurrent(concurrency, tasks) {
  return function* $concurrent(step) {
    let results = [];
    let queued = 0;
    for (var i = 0; i < tasks.length; i++) {
      if (queued === concurrency) {
        yield step;
      }
      tasks[i]((err, val) => {
        queued -= 1;
        results[i] = val;
        step(err);
      });
      queued += 1;
      i++;
    }
    while (queued) {
      yield step;
    }
    return results;
  }
}
module.exports.concurrent = concurrent;
