function toCallback(value, options) {
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
        function (v) {next(null, v)},
        function (e) {next(e, null)}
      )
    };
  }
  else if (Array.isArray(value)) {
    var steps = value.map(toCallback);
    var results = new Array(steps.length);
    // GC cleanup
    value = null;
    var todo = steps.length;
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
        var done = false;
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
    var steps = [];
    var results = Object.create(null);
    var todo = 0;
    for (var key in value) {
      !function (key) {
        todo += 1;
        steps.push(function (next) {
          toCallback(value[key])(function (err, value) {
            results[key] = value;
            next(err);
          });
        });
      }(key);
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

      for (var i = 0; i < steps.length; i++) {
        steps[i](tick);
      }
    }
  }
  else {
    throw new Error('cannot convert to callback');
  }
}
function runner(generator_fn, cb) {
  var done;
  var first = true;
  var waiting_already = false;
  function abort(err) {
    if (done) return;
    if (!err) throw new Error('cannot abort without error');
    done = true;
    first = false;
    waiting_already = true;
    setImmediate(function () {
      cb && cb(err)
    });
  }
  function step(err, val) {
    var result;
    var value;
    // yes, throw.
    // we are running in other people's code at the time
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
        else result = generator.next(val);
      }
      // someone aborted
      if (done) return;
      value = result.value;
      done = result.done;
    }
    catch (e) {
      done = true;
      setImmediate(function () {
        cb && cb(e, null)
      });
      return;
    }
    if (done) {
      setImmediate(function () {
        cb && cb(null, value)
      });
    }
    else if (value == step) {
      // do nothing, we were told that the generator has stuff setup;
    }
    else if (value == null) {
      step(null, undefined);
    }
    else {
      waiting_already = true;
      var fn;
      try {
        fn = toCallback(value);
      }
      catch (e) {
        done = true;
        setImmediate(function () {
          cb && cb(e, null);
        });
        return;
      }
      var performed = false;
      fn(function () {
        if (done) throw new Error('already done');
        var args = Array.prototype.slice.call(arguments);
        if (performed) throw new Error('already performed this step');
        performed = true;
        waiting_already = false;
        setImmediate(function () {
          step.apply(null, args)
        });
      });
    }
  }
  var generator = generator_fn(step, abort);
  setImmediate(step);
}
module.exports = runner;

function concurrent(concurrency, tasks) {
  return function $concurrent(cb) {
    var i = 0;
    var done = false;
    var results = [];
    var queued = 0;
    function next() {
      if (i < tasks.length) {
        var task = tasks[i];
        i += 1;
        queued += 1;
        task(function (err, value) {
          if (err) {
            done = true;
            setImmediate(function () { cb && cb(err, null); } );
          }
          else {
            results[i] = value;
            queued -= 1;
            if (i < tasks.length) {
              next();
              return;
            }
            if (queued) return; 
            done = true;
            setImmediate(function () { cb && cb(null, results); });
          }
        });
      }
    }
    for (var ii = concurrency; ii > 0; ii--) {
      next();
    }
  }
}
module.exports.concurrent = concurrent;
